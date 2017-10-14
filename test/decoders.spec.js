/* eslint-env mocha */
'use strict';

const expect = require('unexpected');
const decoders = require('../lib/decoders');

describe('decoders', function() {
  describe('json', function() {
    it('should convert a JSON string to its value', function() {
      const value = Buffer.from(JSON.stringify({foo: 'bar'}));
      expect(decoders.json(value), 'to equal', {foo: 'bar'});
    });
  });

  describe('base64', function() {
    it('should convert a base64-encoded string to its value', function() {
      const value = Buffer.from('bXkgYnVmZmVy');
      expect(decoders.base64(value), 'to equal', 'my buffer');
    });
  });

  describe('text', function() {
    it('should convert a value to a string', function() {
      const value = Buffer.from('123');
      expect(decoders.text(value), 'to equal', '123');
    });
  });

  describe('binary', function() {
    it('should just return the value', function() {
      const value = Buffer.from('your mom');
      expect(decoders.binary(value), 'to equal', value);
    });
  });
});
