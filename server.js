'use strict'

const fs = require('fs')
const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const shortid = require('shortid')
const validUrl = require('valid-url')
const MongoClient = require('mongodb').MongoClient

const app = express()
const port = process.env.PORT || 3000
const database = 'fcc2018-urlShortener2'
const collectionName = 'urls'
const mongoUrl = `mongodb://localhost:27017/${database}`

app.set('view engine', 'pug')
app.use(bodyParser.urlencoded({extended: true}))

if (!process.env.DISABLE_XORIGIN) {
  app.use(function (req, res, next) {
    var allowedOrigins = ['https://narrow-plane.gomix.me', 'https://www.freecodecamp.com']
    var origin = req.headers.origin || '*'
    if (!process.env.XORIG_RESTRICT || allowedOrigins.indexOf(origin) > -1) {
      console.log(origin)
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    }
    next()
  })
}

// Set up the database
createCollection(collectionName)

// For CSS / Client-side JavaScript
app.use(express.static('public'))

// Used by FCC for some automated checking tool
app.get('/_api/package.json', (req, res) => {
  console.log('requested')
  fs.readFile(path.join(__dirname, 'package.json'), (err, data, next) => {
    if (err) return next(err)
    res.type('txt').send(data.toString())
  })
})

app.get('/', (req, res) => {
  res.render('index')
})

async function newUrl (req, res) {
  let url = req.body.url || req.params.url
  let re = /^https?:\/\/(?:[^.]+\.)+[^.]+/

  console.log(`New URL: ${url}`)

  let urlGood = url.match(re)
  let urlValid = validUrl.isWebUri(url)
  if (!urlGood || !urlValid) {
    res.status(200)
    res.set('Content-Type', 'application/json')
    if (!urlGood) console.log("URL didn't match regex")
    if (!urlValid) console.log("URL didn't pass validUrl check.")
    res.send(JSON.stringify({
      error: 'Wrong url format, make sure you have a valid protocol and real site.'
    }))
    return true
  }

  // Read an existing URL from the database or add a new one
  let document = await readUrl(url) || await createUrl(url)
  let shortUrl = `${req.protocol}://${req.headers.host}/${document._id}`

  res.status(200)
  res.set('Content-Type', 'application/json')
  res.send(JSON.stringify({ original_url: url, short_url: shortUrl }))
}

app.get('/new/:url(*)', newUrl)
app.post('/new', newUrl)

app.get('/:urlId([a-zA-Z0-9-_]+)', async (req, res) => {
  let urlId = req.params.urlId
  console.log(`Processing URL Id: ${urlId}`)

  let document = await readUrlWithId(urlId)
  res.redirect(document.url)
})

// Respond not found to all the wrong routes
app.use(function (req, res, next) {
  res.status(404)
  res.type('txt').send('Not found')
})

// Error Middleware
app.use(function (err, req, res, next) {
  if (err) {
    res.status(err.status || 500)
      .type('txt')
      .send(err.message || 'SERVER ERROR')
  }
})

app.listen(port, () => {
  console.log(`Node.js listening on port ${port} ...`)
})

async function createCollection (collectionName) {
  console.log(`Creating collection: ${collectionName}`)
  let client = await dbClient()
  let db = client.db(database)
  let collection = await db.createCollection(collectionName)
  client.close()
  return collection
}

async function readUrl (url) {
  console.log(`Looking for existing URL: ${url}`)
  let client = await dbClient()
  let db = client.db(database)
  let collection = db.collection(collectionName)
  let document = await collection.findOne({url})
  client.close()
  return document
}

async function readUrlWithId (urlId) {
  console.log(`Looking for existing URL Id: ${urlId}`)
  let client = await dbClient()
  let db = client.db(database)
  let collection = db.collection(collectionName)
  let document = await collection.findOne({_id: urlId})
  client.close()
  return document
}

async function createUrl (url) {
  console.log(`Adding new URL: ${url}`)
  let client = await dbClient()
  let db = client.db(database)
  let collection = db.collection(collectionName)
  let result = await collection.insertOne({
    _id: shortid.generate(),
    url: url
  })
  client.close()
  return result.ops[0]
}

async function dbClient () {
  console.log(`Connecting to database at ${mongoUrl}`)
  return MongoClient.connect(mongoUrl)
}
