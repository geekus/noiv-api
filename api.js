'use strict';

const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const leftPad = require('left-pad');

const bodyParser = require('body-parser');
app.use(bodyParser.json());

const pokemons = require('./pokemons.js')

var connection;

const r = require('rethinkdb');

function startExpress(conn) {
  app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  app.post('/spawns', (req, res, next) => {

  });

  app.put('/spawns/:id', (req, res, next) => {

  });

  io.on('connection', function(socket) {
    socket.emit('news', { hello: 'world2' });

    socket.on('filter change', (data) => {
      const minIv = data.minIv || 80;
      const include = data.include;
      const exclude = data.exclude;

      let filter = r.row('expire_time').gt(Date.now());

      filter = filter.and(r.row('iv').gt(minIv));

      if (include) {
        include.forEach((i) => {
          filter = filter.or(r.row('pokemon_id').eq(i.pokemon_id));
        });
      }

      r.db('noiv')
        .table('spawns')
        .filter(filter)
        .limit(1000)
        .run(conn, (err, cursor) => {
          if (err) throw err;

          cursor.toArray((err, result) => {
            if (err) throw err;

            socket.emit('update', result.map((s) => (
              Object.assign(s, {
                geojson: {
                  type: 'Point',
                  coordinates: [s.lon, s.lat]
                },
                icon: `${leftPad(s.pokemon_id, 3, '0')}-${s.pokemon_name.toLowerCase()}`
              })
            )));
          });
      });
    });

    socket.on('my other event', function(data) {
      const minIv = data.minIv || 80;
      const include = data.include;
      const exclude = data.exclude;

      let filter = r.row('expire_time').gt(Date.now());

      filter = filter.and(r.row('iv').gt(minIv));

      r.db('noiv')
        .table('spawns')
        .filter(filter)
        .limit(1000)
        .run(conn, (err, cursor) => {
          if (err) throw err;

          cursor.toArray((err, result) => {
            if (err) throw err;

            socket.emit('update', result.map((s) => (
              Object.assign(s, {
                geojson: {
                  type: 'Point',
                  coordinates: [s.lon, s.lat]
                },
                icon: `${leftPad(s.pokemon_id, 3, '0')}-${s.pokemon_name.toLowerCase()}`
              })
            )));
          });
      });
    });


    // On table changes
    r.db('noiv').table('spawns')
      .changes()
      .run(conn, function(err, cursor){
        if (err) throw err;

        cursor.each(function(err, row) {
          if (err) throw err;

          const s = row.new_val;

          socket.emit('spawn added',
            Object.assign(s, {
              geojson: {
                type: 'Point',
                coordinates: [s.lon, s.lat]
              },
              icon: `${leftPad(s.pokemon_id, 3, '0')}-${s.pokemon_name.toLowerCase()}`
            })
          );

        });
      });

  });

  app.get('/spawns', function(req, res) {
    res.header('Content-Type', 'application/json');

    const iv = req.params.iv;

    // if (iv[0] === '>') {
    //
    // }

    r.db('noiv')
      .table('spawns')
      .filter(r.row('expire_time').gt(Date.now()))
      .limit(20)
      .run(conn, (err, cursor) => {
        if (err) throw err;

        cursor.toArray((err, result) => {
          if (err) throw err;

          res.send(result);
        });
    });
  });

  app.get('/pokemons', (req, res) => {
    res.header("Content-Type", "application/json");

    Object.keys(pokemons).forEach(id => {
      pokemons[id].icon = `${leftPad(id, 3, '0')}-${pokemons[id].name.toLowerCase()}`;
      pokemons[id].id = Number(id);
    });

    res.send(pokemons);
  });

  server.listen(3000);
}

// const host = 'rethinkdb.eple.me' || process.env.RETHINK_PORT_28015_TCP_ADDR || 'rethinkdb';
const host = process.env.RETHINK_PORT_28015_TCP_ADDR || 'rethinkdb';
const port = process.env.RETHINK_PORT_28015_TCP_PORT || '28015';
const db = process.env.RETHINK_PORT_28015_TCP_DB || 'noiv';

const config = {
  rethinkdb: {
    host: host,
    port: port,
    db: db
  },
};


/*
 * Create tables/indexes then start scanning
 */
r.connect(config.rethinkdb, function(err, conn) {
  if (err) {
    console.log("Could not open a connection to initialize the database");
    console.log(err.message);
    process.exit(1);
  }

  console.log('Connected successfully to rethinkdb');

  r.table('spawns').indexWait().run(conn).then((err, result) => {
    console.log("Table and index are available, start scanning!");

    startExpress(conn);
  }).error((err) => {
    // The database/table/index was not available, create them
    r.dbCreate(config.rethinkdb.db).run(conn).finally(() => {
      return r.tableCreate('spawns').run(conn);
    }).finally(() => {
      r.table('spawns').indexCreate('location', {geo: true}).run(conn);
    }).finally((result) => {
      r.table('spawns').indexWait().run(conn);
    }).then((result) => {
      console.log("Table and index are available, starting express...");

      startExpress(conn);
    }).error((err) => {
      if (err) {
        console.log("Could not wait for the completion of the index `spawns`");
        console.log(err);
        process.exit(1);
      }

      console.log("Table and index are available, start scanning!");
      startExpress(conn);
    });
  });
});
