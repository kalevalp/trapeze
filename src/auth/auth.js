const {KV_Store} = require("kv-store");
const fs = require("fs");
const crypto = require('crypto');
const md5sum = crypto.createHash('md5');

const conf = JSON.parse(fs.readFileSync('conf.json', 'utf8'));

function auth(user, pass, callback) {
    md5sum.update(user + pass, 'utf8');
    const h = md5sum.digest('hex');

    // Copy pasted, more or less, from the unsafe hello-world example.
    // Could probably be refactored.

    let kv = new KV_Store(conf.host, conf.user, conf.pass);

    kv.init((err) => {
        if (err) {
            callback(err);
        } else {
            kv.get(h, (err, result) => {
                if (err) {
                    callback(err);
                } else {
                    kv.close((err) => {
                        if (err) {
                            callback(err);
                        } else {
                            callback(null, result);
                        }
                    })
                }
            })
        }
    })

}

function storeCredentials(user, pass, label, callback) {
    md5sum.update(user + pass, 'utf8');
    const h = md5sum.digest('hex');

    // Copy pasted, more or less, from the unsafe hello-world example.
    // Could probably be refactored.

    let kv = new KV_Store(conf.host, conf.user, conf.pass);

    kv.init((err) => {
        if (err) {
            callback(err);
        } else {
            kv.put(h, label, (err, result) => {
                if (err) {
                    callback(err);
                } else {
                    kv.close((err) => {
                        if (err) {
                            callback(err);
                        } else {
                            callback(null, result);
                        }
                    })
                }
            })
        }
    })
}

module.exports.auth = auth;
module.exports.storeCredentials = storeCredentials;
