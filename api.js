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

function alertFilter(list) {
  return list.filter(item => item.iv > 80);
};

function startExpress(conn) {
  app.get('/spawns', function(req, res){
    res.header('Content-Type', 'application/json');
    r.db('noiv')
      .table('spawns')
      .filter(r.row('expire_time').gt(Date.now()))
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
      pokemons[id].icon = `require('./resources/icons/pokemons/png/2x/${leftPad(id, 3, '0')}-${pokemons[id].name.toLowerCase()}.png)`;
    });

    res.send(pokemons);
  });

  r.db('noiv').table('spawns')
    .changes()
    .run(conn, function(err, cursor){
      if (err) throw err;
      io.sockets.on('connection', function(socket){
        cursor.each(function(err, row) {
          if(err) throw err;
          io.sockets.emit('spawns_updated', row);
        });
      });
  });

  server.listen(3000);
}

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
