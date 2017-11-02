const fs = require('fs');

const b = fs.readFileSync('/Users/kalpernas/Downloads/cat.jpg');

const encoded = b.toString('base64');
console.log(encoded);

const b2 = Buffer.from(encoded, 'base64');

console.log(b.toString('base64') === b2.toString('base64'))

fs.writeFile('/Users/kalpernas/Downloads/cat-trans.jpg', b2);