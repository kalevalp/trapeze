#!/usr/bin/env bash

curl -X POST --data '{"key": "cat1", "image_url" : "https://www.petfinder.com/wp-content/uploads/2012/11/91615172-find-a-lump-on-cats-skin-632x475.jpg", "user" : "catowner", "pass" : "catownerpassword"}' $1
