// JSON Cleartext Signing
'use strict'

const rsasign = require('jsrsasign') // eslint-disable-line no-unused-vars
const ServerError = require('../errors/server-error')
const _ = require('lodash')

// Constants for crypto algorithm types (ECDSA and RSA)
const ES256 = 'ES256'
const PS256 = 'PS256'
module.exports.types = {
  ES256,
  PS256
}

// If given key is PEM formatted string, convert it to key object
// If it's already key object, just use it
function parseKey (key) {
  if (typeof key === 'string') {
    return rsasign.KEYUTIL.getKey(key)
  } else {
    return key
  }
}

// Sign JSON object, using ECDSA P-256 private key and public key.
// Insert 'signature' block in the JSON object.
// Warning: there must not be an existing 'signature' block.
module.exports.sign = function (json, cryptoType, prvKey, pubKey) {
  if (cryptoType === ES256) return signECDSA(json, prvKey, pubKey)
  else if (cryptoType === PS256) return signRSA(json, prvKey)
  else throw new ServerError('Unsupported crypto algorithm: ' + cryptoType)
}

function signECDSA (json, prvKey, pubKey) {
  if (!prvKey) throw new ServerError('Problem reading private key for JSON signing')
  if (!pubKey) throw new ServerError('Problem reading public key for JSON signing')
  const strJWS = KJUR.jws.JWS.sign('ES256', // eslint-disable-line no-undef
                                   JSON.stringify({alg: 'ES256'}),
                                   JSON.stringify(json),
                                   prvKey)
  const jwsArray = strJWS.split('.')
  // Get x and y coordinates
  const pubKeyHex = pubKey.pubKeyHex
  // According to jsrsasign documentation,
  // pubkey hex length should be 2 (header) + 64 (X) + 64 (Y) = 130.
  // first two chracters must be "04".
  if (pubKeyHex.length !== 130 || !_.startsWith(pubKeyHex, '04')) {
    throw new ServerError('Problem decoding public key for JSON signing')
  }
  const hX = pubKeyHex.slice(2, 66)
  const hY = pubKeyHex.slice(66, 130)

  const signedJSON = _.cloneDeep(json)
  signedJSON.signature = {
    'algorithm': 'ES256',
    'publicKey': {
      'type': 'EC',
      'curve': 'P-256',
      'x': hX,
      'y': hY
    },
    'value': jwsArray[2]
  }
  return signedJSON
}

// Sign JSON object using RSA
function signRSA (json, prvKey) {
  if (!prvKey) throw new ServerError('Problem reading private key for JSON signing')
  const prvKeyObj = parseKey(prvKey)
  const strJWS = KJUR.jws.JWS.sign(PS256, // eslint-disable-line no-undef
                                   JSON.stringify({alg: PS256}),
                                   JSON.stringify(json),
                                   prvKeyObj)
  const jwsArray = strJWS.split('.')
  // TODO: To make e and n exactly compliant with JCS spec, E and N must be represented as
  // "Base64URL-encoded positive integer with arbitrary precision."
  // jsrsasign stores public key components "e" as Number, and "n" as BigInteger
  const pubkeyE = new Buffer(prvKeyObj.e.toString()).toString('base64')
  const pubkeyN = new Buffer(prvKeyObj.n.toString()).toString('base64')
  const signedJSON = _.cloneDeep(json)
  signedJSON.signature = {
    'algorithm': PS256,
    'publicKey': {
      'type': 'RSA',
      'e': pubkeyE,
      'n': pubkeyN
    },
    'value': jwsArray[2]
  }
  return signedJSON
}

// Verify 'signature' block on the input JSON object has the correct signature value.
module.exports.verify = function (json, cryptoType, pubKey) {
  if (cryptoType === ES256) return verifyECDSA(json, pubKey)
  else if (cryptoType === PS256) return verifyRSA(json, pubKey)
  else throw new ServerError('Unsupported crypto algorithm: ' + cryptoType)
}

function verifyECDSA (json, pubKey) {
  if (!json || !json.signature || !json.signature.value) {
    throw new ServerError('Invalid input for JSON verification')
  }
  const jsonWithoutSignature = _.omit(json, 'signature')

  let strPayload = new Buffer(JSON.stringify(jsonWithoutSignature)).toString('base64')
  // chop trailing '=='
  if (_.endsWith(strPayload, '==')) {
    strPayload = strPayload.slice(0, strPayload.length - 2)
  }

  // check pub key coordinates X and Y in signature
  const pubKeyHex = pubKey.pubKeyHex
  // According to jsrsasign documentation,
  // pubkey hex length should be 2 (header) + 64 (X) + 64 (Y) = 130.
  // first two chracters must be "04".
  if (pubKeyHex.length !== 130 || !_.startsWith(pubKeyHex, '04')) {
    throw new ServerError('Problem decoding public key for JSON signature verification')
  }
  const hX = pubKeyHex.slice(2, 66)
  const hY = pubKeyHex.slice(66, 130)
  if (json.signature.publicKey.x !== hX || json.signature.publicKey.y !== hY) {
    throw new ServerError('Public key mismatch in JSON signature verification')
  }

  const jws = 'eyJhbGciOiJFUzI1NiJ9\.' + // Base64 encoded {"alg":"ES256"}
        strPayload + '\.' + json.signature.value
  return KJUR.jws.JWS.verify(jws, pubKey) // eslint-disable-line no-undef
}

function verifyRSA (json, pubKey) {
  if (!json || !json.signature || !json.signature.value) {
    throw new ServerError('Invalid input for JSON verification')
  }
  if (!pubKey) throw new ServerError('Problem reading public key for JSON signing')
  const pubKeyObj = parseKey(pubKey)
  const jsonWithoutSignature = _.omit(json, 'signature')

  let strPayload = new Buffer(JSON.stringify(jsonWithoutSignature)).toString('base64')
  // chop trailing '=='
  if (_.endsWith(strPayload, '==')) {
    strPayload = strPayload.slice(0, strPayload.length - 2)
  }
  // Check pub key parameters
  const pubkeyE = new Buffer(pubKeyObj.e.toString()).toString('base64')
  const pubkeyN = new Buffer(pubKeyObj.n.toString()).toString('base64')
  if (json.signature.publicKey.e !== pubkeyE || json.signature.publicKey.n !== pubkeyN) {
    throw new ServerError('Public key mismatch in JSON signature verification')
  }
  const jws = 'eyJhbGciOiJQUzI1NiJ9\.' + // Base64 encoded {"alg":"PS256"}
        strPayload + '\.' + json.signature.value
  return KJUR.jws.JWS.verify(jws, pubKeyObj, [PS256]) // eslint-disable-line no-undef
}