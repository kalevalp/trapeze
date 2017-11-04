const mysql = require('mysql');
const bbPromise = require('bluebird');
const fs = require('fs');

const conf = JSON.parse(fs.readFileSync(__dirname + '/conf.json', 'utf8'));

function main() {
    "use strict";


    const con = bbPromise.promisifyAll(mysql.createConnection({
        host: conf.host,
        user: conf.user,
        password: conf.pass,
        database: "unsecurekv"
    }));

    return con.connectAsync()
        .then(() => con.queryAsync("SHOW TABLES;"))
        .then(res => con.endAsync().then(() => res))
        .then(res => ({ result: res}))
        .catch(err => console.log(err));
}

exports.main = main;
