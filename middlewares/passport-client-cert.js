'use strict'

const Strategy = require('passport-strategy')

/**
 * `Strategy` constructor.
 *
 * The client cert authentication strategy authenticates requests based on the
 * client certificate credentials submitted in the TLS handshake
 *
 * Applications must supply a `verify` callback which accepts a `fingerprint`
 * and an `info` object. The `info` object contains the `subject` and `issuer`
 * of the client certificate. It then calls the `done` callback supplying a
 * `user`.  User should be set to `false` if the credentials are not valid.  If
 * an exception occured, `err` should be set.
 *
 * Options:
 *   - `passReqToCallback`  when `true`, `req` is the first argument to the
 *      verify callback (default: `false`)
 *
 * Examples:
 *
 * passport.use(new ClientCertStrategy(
 *   function (fingerprint, info, done) {
 *     if (!config.auth.client_certificates_enabled) {
 *       return done(new UnauthorizedError('Unsupported authentication method'))
 *     }
 *
 *     Account.findByFingerprint(fingerprint)
 *       .then(function (userObj) {
 *         if (!userObj || userObj.is_disabled || userObj.fingerprint !== fingerprint) {
 *           return done(new UnauthorizedError('Unknown or invalid account'))
 *         }
 *         done(null, userObj)
 *       })
 *   }))
 *
 *
 * @param {Object} options
 * @param {Function} verify
 * @api public
 */
class ClientCertStrategy extends Strategy {
  constructor (options, verify) {
    if (typeof options === 'function') {
      verify = options
      options = {}
    }
    if (!verify) throw new Error('Client cert authentication strategy requires a verify function')

    super()

    this.name = 'client-cert'
    this._verify = verify
    this._passReqToCallback = options.passReqToCallback
  }

  _verified (err, user) {
    if (err) { return this.error(err) }
    if (!user) { return this.fail() }
  }

  authenticate (req, options) {
    // Requests must be authorized
    // (i.e. the certificate must be signed by at least one trusted CA)
    if (!req.socket.authorized) {
      this.fail()
      return
    }

    // { subject:
    //    { C: 'US',
    //      ST: 'MA',
    //      L: 'Boston',
    //      O: 'Example Co',
    //      OU: 'techops',
    //      CN: 'client1',
    //      emailAddress: 'certs@example.com' },
    //   issuer:
    //    { C: 'US',
    //      ST: 'MA',
    //      L: 'Boston',
    //      O: 'Example Co',
    //      OU: 'techops',
    //      CN: 'ca',
    //      emailAddress: 'certs@example.com' },
    //   fingerprint: 'E5:F6:7F:34:6B:28:92:9C:07:18:0B:46:5A:D5:E4:50:CA:4F:DD:25',
    //   ...
    const clientCert = req.socket.getPeerCertificate()

    if (!clientCert) {
      this.fail()
      return
    }

    const fingerprint = clientCert.fingerprint.toUpperCase()
    const info = {
      subject: clientCert.subject,
      issuer: clientCert.issuer
    }

    if (this._passReqToCallback) {
      this._verify(req, fingerprint, info, this._verified.bind(this))
    } else {
      this._verify(fingerprint, info, this._verified.bind(this))
    }
  }
}

module.exports = ClientCertStrategy
