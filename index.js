'use strict';

const express = require('express');
const app = express();

const server = require('http').createServer(app);
const io = require('socket.io')(server);

const bodyParser = require('body-parser');
app.use(bodyParser.json());


var connection;
const puppeteer = require('puppeteer');

// const r = require('./rethinkdb.js');
const r = require('rethinkdb');

function alertFilter(list) {
  return list.filter(item => item.iv > 80);
};

function startScanning(conn) {

  (async() => {
    const browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    const page = await browser.newPage();
    // await page.setRequestInterception(true);
    //
    // page.on('request', request => {
    //   if (request.resourceType !== 'xhr')
    //     request.abort();
    //   else
    //     request.continue();
    // });

    page.on('response', response => {
      // console.log('on response');
      response
        .json()
        .then(json => {
          const alerts = alertFilter(json.pokemons);

          if (alerts.length) {
  //           console.log(`${alerts.map(alert => (
  //             `${alert.pokemon_name} ${alert.iv}
  // `
  //           ))}`);
            console.log('got alerts!');

            r
              .table('spawns')
              .getAll()
              .delete()
              .run(conn)
              .then((result) => {
                console.log('deleted all', result);
                r
                  .table('spawns')
                  .insert(alerts)
                  .run(conn)
                  .then((result) => {
                    console.log('inserted spawns', result);
                  })
                  .catch((err) => {
                    throw new Error(err);
                  });
              })
              .catch((err) => {
                throw new Error(err);
              });

          } else {
            // console.log('No new!')
          }
        })
        .catch(err => {
          // console.error('err');
          // console.error(err);
        });
    });





    await page.goto('https://nomaps.me/livemap/oslo', {
      waitUntil: 'networkidle2'
    });

    page.evaluate(() => {
      window.map.setZoom(10);
    });

    await page.screenshot({path: 'news.png', fullPage: true});

    // await browser.close();
  })();


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





  app.get('/spawns', function(req, res){
      res.header("Content-Type", "application/json");
      r.db('noiv').table('spawns')
          .limit(30)
          .run(conn, function(err, cursor) {
              if (err) throw err;
              cursor.toArray(function(err, result) {
                  if (err) throw err;
                  res.send(result);
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
    express: {
        port: 3000
    }
};


/*
 * Create tables/indexes then start express
 */
r.connect(config.rethinkdb, function(err, conn) {
  if (err) {
    console.log("Could not open a connection to initialize the database");
    console.log(err.message);
    process.exit(1);
  }

  console.log('Connected successfully to rethinkdb');

  r.table('spawns').indexWait().run(conn).then(function(err, result) {
    console.log("Table and index are available, starting express...");
    startScanning(conn);
  }).error(function(err) {
    // The database/table/index was not available, create them
    r.dbCreate(config.rethinkdb.db).run(conn).finally(function() {
      return r.tableCreate('spawns').run(conn)
    }).finally(function() {
      r.table('spawns').indexCreate('location', {geo: true}).run(conn);
    }).finally(function(result) {
      r.table('spawns').indexWait().run(conn)
    }).then(function(result) {
      console.log("Table and index are available, starting express...");
      startScanning(conn);
      // conn.close();
    }).error(function(err) {
      if (err) {
        console.log("Could not wait for the completion of the index `spawns`");
        console.log(err);
        process.exit(1);
      }
      console.log("Table and index are available, starting express...");
      startScanning(conn);
      // conn.close();
    });
  });
});

