#!/usr/bin/env bash

#time curl -X POST --data '{"key": "cat1", "image_url" : "https://www.petfinder.com/wp-content/uploads/2012/11/91615172-find-a-lump-on-cats-skin-632x475.jpg", "user" : "dogowner", "pass" : "dogownerpassword"}' $1
#time curl -X POST --data '{"key": "cat2", "image_url" : "https://static.pexels.com/photos/104827/cat-pet-animal-domestic-104827.jpeg", "user" : "catowner", "pass" : "catownerpassword"}' $1

curl -X POST --data '{"code" : "'\
'let stealingKV = new KV_Store(conf.host, conf.user, conf.pass, process.env.TABLE_NAME);'\
'stealingKV.init()'\
'   .then(() => stealingKV.get(\"cat1\"))'\
'   .then(res => stealingKV.close().then(() => res))'\
'   .then(res => callback(null,util.success(res.length)))'\
'", "user" : "dogowner", "pass" : "dogownerpassword"}' $1
#'", "user" : "catowner", "pass" : "catownerpassword"}' $1
#curl -X POST --data '{"code" : "callback(null, util.success(\"Huh\"))", "user" : "catowner", "pass" : "catownerpassword"}' $1
