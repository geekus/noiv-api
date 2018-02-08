'use strict';

let connection;

const puppeteer = require('puppeteer');
const r = require('rethinkdb');

function startScanning(conn) {

  (async() => {
    const browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    console.log('Browser launched')

    const page = await browser.newPage();

    console.log('Opened new page')
    // await page.setRequestInterception(true);
    //
    // page.on('request', request => {
    //   if (request.resourceType !== 'xhr')
    //     request.abort();
    //   else
    //     request.continue();
    // });

    page.on('response', response => {
      response
        .json()
        .then(json => {
          const spawns = json.pokemons
            .filter(p => p.spawn_id)
            .map(s => {
              return Object.assign({}, s, {id: s.spawn_id});
            });

          if (spawns.length) {
            r.table('spawns')
              .getAll()
              .delete()
              .run(conn)
              .then((result) => {
                r
                  .table('spawns')
                  .insert(spawns, {conflict: 'update'})
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

    startScanning(conn);
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

      startScanning(conn);
    }).error((err) => {
      if (err) {
        console.log("Could not wait for the completion of the index `spawns`");
        console.log(err);
        process.exit(1);
      }

      console.log("Table and index are available, start scanning!");
      startScanning(conn);
    });
  });
});
