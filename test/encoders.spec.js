/* eslint-env mocha */
'use strict';

const expect = require('unexpected');
const encoders = require('../lib/encoders');

describe('encoders', function() {
  describe('json', function() {
    it('should convert a value to a JSON string', function() {
      const value = {foo: 'bar'};
      expect(encoders.json(value), 'to equal', JSON.stringify(value));
    });
  });

  describe('base64', function() {
    it('should convert a value to a base64-encoded string', function() {
      const value = Buffer.from('my buffer');
      expect(encoders.base64(value), 'to equal', 'bXkgYnVmZmVy');
    });
  });

  describe('text', function() {
    it('should convert a value to a string', function() {
      const value = 123;
      expect(encoders.text(value), 'to equal', '123');
    });
  });

  describe('binary', function() {
    it('should convert a value to a buffer', function() {
      const value = 'your mom';
      expect(encoders.binary(value), 'to equal', Buffer.from('your mom'));
    });
  });
});
