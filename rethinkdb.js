'use strict';

const EventEmitter = require('events').EventEmitter;
const rethink = require('rethinkdb');
const inherits = require('util').inherits;

const RethinkWrapper = function RethinkWrapper(opts) {
  EventEmitter.call(this);

  this.c = null;

  rethink.connect(opts, (err, conn) => {
    if (err) { throw err; }

    this.c = conn;
    this.emit('open');
  });

  return this;
};

inherits(RethinkWrapper, EventEmitter);

if (process.env.RETHINK_URI) {
  module.exports = new RethinkWrapper(process.env.RETHINK_URI);
} else {
  const host = process.env.RETHINK_PORT_28015_TCP_ADDR || 'rethinkdb';
  const port = process.env.RETHINK_PORT_28015_TCP_PORT || '28015';
  const db = process.env.RETHINK_PORT_28015_TCP_DB || 'test';

  module.exports = new RethinkWrapper({ host, port, db });
}

module.exports.r = rethink;

module.exports.spawns = rethink.table('spawns');

module.exports.RethinkWrapper = RethinkWrapper;
