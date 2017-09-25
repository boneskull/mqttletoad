/* eslint-env mocha */

'use strict';

const expect = require('unexpected');
const {MqttClient} = require('mqtt');
const {connect} = require('..');
const {createBroker} = require('./harness');
const getPort = require('get-port');

describe('mqttletoad', function () {
  let broker;
  let listeningPort;

  beforeEach(function (done) {
    broker = createBroker();

    getPort()
      .then(port => {
        listeningPort = port;
        broker.listen(port, done);
      });
  });

  afterEach(function (done) {
    broker.close(done);
  });

  describe('connect()', function (done) {
    let promise;

    beforeEach(function () {
      promise = connect(`mqtt://localhost:${listeningPort}`);
    });

    afterEach(function (done) {
      promise.then(client => {
        client.end(true, done);
      });
    });

    it(
      'should resolve with the wrapped MqttClient once connected', function () {
        return expect(
          promise, 'when fulfilled', expect.it('to be a', MqttClient));
      });

    it('should not allow an invalid message to be published', function () {
      return promise.then(
        client => expect(client.publish('foo/bar', new Date()),
          'to be rejected'
        ));
    });
  });

  describe('mqttletoad client', function () {
    let client;

    beforeEach(function () {
      return connect(`mqtt://localhost:${listeningPort}`)
        .then(c => {
          client = c;
        });
    });

    afterEach(function (done) {
      client.end(true, done);
    });

    describe('emit()', function () {
      it(
        'should publish with the (string) message and fulfill with the topic',
        function () {
          return expect(
            client.emit('foo', 'bar'), 'to be fulfilled with', 'foo');
        }
      );

      it(
        'should fulfill with the (Buffer) message and fulfill with the topic',
        function () {
          return expect(client.emit('foo', Buffer.from([0x00, 0x01, 0x02])),
            'to be fulfilled with', 'foo'
          );
        }
      );

      it(
        'should throw if non-string, non-Buffer or non-ArrayBuffer value',
        function () {
          return expect(client.emit('foo', new Date()), 'to be rejected');
        }
      );
    });

    describe('on()', function () {
      describe('invalid parameters', function () {
        describe('no parameters', function () {
          it('should throw', function () {
            expect(() => client.on(), 'to throw', TypeError);
          });
        });

        describe('undefined listener', function () {
          it('should throw', function () {
            expect(() => client.on('foo/bar'), 'to throw', TypeError);
          });
        });

        describe('non-function listener', function () {
          it('should throw', function () {
            expect(() => client.on('foo/bar', {}), 'to throw', TypeError);
          });
        });
      });

      it('should subscribe to a topic', function (done) {
        client.once('suback', () => done());
        expect(client.on('foo/bar', () => {
        }), 'to equal', client);
      });

      it(
        'should execute the handler when exact matching topic received',
        function (done) {
          client.once('suback', () => {
            client.emit('foo/bar', 'baz', {qos: 1});
          });
          client.on('foo/bar', message => {
            expect(String(message), 'to equal', 'baz');
            done();
          });
        }
      );

      it('should execute the handler when wildcard (#) topic received',
        function (done) {
          client.once('suback', () => {
            client.emit('foo/bar/baz', 'quux', {qos: 1});
          });
          client.on('foo/#', message => {
            expect(String(message), 'to equal', 'quux');
            done();
          });
        }
      );

      it('should execute the handler when wildcard (+) topic received',
        function (done) {
          client.once('suback', () => {
            client.emit('foo/bar/baz', 'quux', {qos: 1});
          });
          client.on('foo/+/baz', message => {
            expect(String(message), 'to equal', 'quux');
            done();
          });
        }
      );

      it('should always call the handler with a Buffer', function (done) {
        client.once('suback', () => {
          client.emit('foo/bar', 'quux', {qos: 1});
        });
        client.on('foo/bar', message => {
          expect(Buffer.isBuffer(message), 'to be true');
          done();
        });
      });

      it(
        'should execute all matching handlers (in order of specificity)',
        function (done) {
          let count = 0;
          let subacks = 0;
          client.on('suback', () => {
            subacks++;
            if (subacks === 3) {
              client.emit('foo/quux/bar', 'baz', {qos: 1});
            }
          });
          client.on('foo/+/bar', message => {
            count++;
          });
          client.on('foo/#', message => {
            expect(count, 'to equal', 2);
            done();
          });
          client.on('foo/quux/bar', message => {
            count++;
          });
        }
      );

      // XXX tests should make assertions.
      it('should subscribe to the same topic twice', function (done) {
        client.once('suback', () => {
          client.once('suback', () => done());
        });
        client.on('foo/bar', () => {});
        client.on('foo/bar', () => {});
      });
    });

    describe('once()', function () {
      describe('when single listener on topic', function () {
        it('should unsubscribe after message received once', function (done) {
          client.once('suback', () => {
            client.emit('foo/bar', 'baz');
          });
          client.once('unsuback', ({topic}) => {
            expect(topic, 'to equal', 'foo/bar');
            done();
          });
          client.once('foo/bar', () => {
          });
        });
      });

      describe('when multiple listeners on topic', function () {
        it('should unsubscribe only after all messages received once',
          function (done) {
            client.once('suback', () => {
              client.emit('foo/bar', 'baz');
            });
            let called = false;
            client.on('unsuback', ({topic}) => {
              expect(called, 'to be falsy');
              process.nextTick(done);
            });
            client.once('foo/bar', () => {
            });
            client.once('foo/bar', () => {
            });
          }
        );
      });
    });
  });
});
