function declassifier(err, result, callback) {
    if (err) {
        callback(err);
    } else {
        if (result === false) {
            callback(null, false);
        } else if (result === true){
            callback(null, true);
        } else {
            callback(null, null);
        }
    }
}

module.exports.declassifier = declassifier;