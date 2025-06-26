/* Node Express Router
    Moving the Router/Server aspect away from the underlying code
*/

import express from 'express'
import { MarblesAppServer } from './MarblesAppServer.mjs';
import fsAll from 'fs';
// import HyperExpress from 'hyper-express'
import helmet from "helmet";
import path from 'path'

const server = express()
const PORT = 4000;
const HOST = 'localhost'

const env = process.env.NODE_ENV || 'development';
const SERVER_CONFIG_FILE = 'server_config.json'

const app_server = new MarblesAppServer()

// server.use(express.json()) // for parsing application/json
// server.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

// server.use((req, res, next) => {
//     res.append('Access-Control-Allow-Origin', ['*']);
//     res.append('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
//     res.append('Access-Control-Allow-Headers', 'Content-Type');
//     next();
// });

server.use(helmet())

server.get(['/', '/website/{*route}'], (req, res) => {
    let rootPath = null
    if (req.path == '/')
        rootPath = path.resolve('website/index.html')
    else
        rootPath = path.resolve(req.path.slice(1))
    res.sendFile(rootPath)
})  

/**
 * Start running the image parser 
 * returns a JSON indicating the result of startup
 */
server.post(['/start', '/start/{*route}'], (req, res) => {
    
    console.log(`Recieved START command ${req.originalUrl}.`)
    let streamName = null
    if (req.originalUrl != '/start')
        streamName = req.originalUrl.replace('/start/', '')
    
    let vodDumpFlag = req.query?.vodDump ? true : false;
    res.json(app_server.start(streamName, vodDumpFlag))

})

server.all(['/force'], (req, res) => {
    
    console.log(`Recieved FORCE command ${req.originalUrl}.`)
    if (app_server.ServerStatus.notReading) {
        app_server.start()
        // Now into wait state if not started previously
        app_server.ServerStatus.enterReadState()
        res.json({'res':"Forced into READING state"})
        // TODO: Tell users that it started late
    } else {
        res.json({'res':`Currently in ${app_server.ScreenState.state} state`})
    }
})

/**
 * Stop image parser
 * returns JSON indicating the result of stopping
 */
server.post('/stop', (req, res) => {
    console.log(`Recieved STOP command.`)
    res.json(app_server.stop())
})

/**
 * Clear usernameList
 */
server.post('/clear', (req, res) => {
    // AUTH
    console.log("Recieved CLEAR command.")
    res.send(app_server.clear()) // TODO: Handle errors
})

server.get('/status', (req, res) => {
    // TODO: Create a user version with less detail
    res.json(app_server.status(req))
})

server.get('/find/:userName', (req, res) => {
    const reqUsername = req.params.userName
    console.debug(`Finding user ${reqUsername}`)
    return res.json(app_server.find(reqUsername))
})

/**
 * Return image to request, or 404 if not found
 */
server.get(['/img/:userName', '/idx_img/:id', '/idx_img/:id/:pic'], (req, res) => {

    let userImage = null
    if (req.path.startsWith('/img')) {
        const reqUsername = req.params.userName
        console.debug(`Returning user image ${reqUsername}`)
        userImage = app_server.getImage(reqUsername)
    }
    else {
        const reqId = req.params.id
        const pIdx = req.params.pic ?? -1
        console.debug(`Returning image idx: ${reqId}`)
        userImage = app_server.getImageByIndex(reqId, pIdx)
    }

    // return image if exists
    if (userImage) {
        res.contentType('jpeg')
        res.send(userImage)
    } else {
        res.sendStatus(404)
    }
})

server.get('/list', (req, res) => {
    res.json(app_server.list())
})

server.post('/localTest', async (req, res) => {
    const source = req.query?.source
    const ocrType = req.query?.ocr
    const skipTo = parseInt(req.query?.skipTo, 10) ?? null
    const vodDump = req.query?.vodDump ?? false
    const listSource = req.query?.listSource

    if (listSource)
        app_server.ServerStatus.localListSource = listSource

    try {
        const json_resp = await app_server.localTest(source, ocrType, vodDump, skipTo)
        res.send(json_resp)
    } catch (err) {
        res.status(400).send(`Error occurred during testing. ${err}`)
    }
})

server.post('/user_list_test', async (req, res) => {
    const userlist = req.query?.source

    try {
        const json_resp = await app_server.testAgainstList(null, userlist)
        res.send(json_resp)
    } catch (err) {
        res.status(400).send(`Error occurred during testList ${err}`)
    }
})


server.listen(PORT, (socket) => {
    let server_env = (env == 'development') ? 'DEV' : 'PROD'
    console.log(`Server[${server_env}] running at ${HOST}:${PORT}`)

    try {
        const server_config_file = fsAll.readFileSync(SERVER_CONFIG_FILE, {encoding:'utf-8'})
        const server_json = JSON.parse(server_config_file)
        app_server.setConfig(server_json)
    } catch (error) {
        if (error.code == "ENOENT") {
            // do nothing, file doesn't exist
        } else {
            console.warn("Error occurred during config setup", error)
        }
    }
    
})