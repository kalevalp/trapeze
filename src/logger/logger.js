if (!process.env.TRPZ_DEBUG) {    
    module.exports.log = function () {}
} else {
    module.exports.log = function (message, verbosity) {
	if (verbosity <= parseInt(process.env.TRPZ_DEBUG)) {
	    console.log(message);
	}
    }
}

