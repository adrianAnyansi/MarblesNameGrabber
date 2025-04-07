/* Node Express Router
    Moving the Router/Server aspect away from the underlying code
*/

import express from 'express'
import { MarblesAppServer } from './MarblesAppServer.mjs';
// import HyperExpress from 'hyper-express'
import helmet from "helmet";
import path from 'path'

const server = express()
const PORT = 4000;
const HOST = 'localhost'

const env = process.env.NODE_ENV || 'development';

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

server.get(['/', '/website/*'], (req, res) => {
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
server.post(['/start', '/start/*'], (req, res) => {
    
    console.log(`Recieved START command ${req.originalUrl}.`)
    let streamName = null
    if (req.originalUrl != '/start')
        streamName = req.originalUrl.replace('/start/', '')
    
    let vodDumpFlag = req.query?.vodDump ? true : false;
    res.json(app_server.start(streamName, vodDumpFlag))

})

server.all(['/force'], (req, res) => {
    
    console.log(`Recieved FORCE command ${req.originalUrl}.`)
    if (app_server.ServerState.notReading) {
        app_server.start()
        // Now into wait state if not started previously
        app_server.ServerState.enterReadState()
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
server.get(['/img/:userName', '/fullimg/:id'], (req, res) => {

    let userImage = null
    if (req.path.startsWith('/img')) {
        const reqUsername = req.params.userName
        console.debug(`Returning user image ${reqUsername}`)
        userImage = app_server.getImage(reqUsername)
    }
    // } else {
    //     const reqId = req.params.id
    //     console.debug(`Returning image num: ${reqId}`)
    //     userImage = app_server.getFullImg(reqId)
    // }

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
    let source = req.query?.source
    let ocrType = req.query?.ocr
    const vodDump = req.query?.vodDump ?? false

    try {
        let json_resp = await app_server.localTest(source, ocrType, vodDump)
        res.send(json_resp)
    } catch (err) {
        res.status(400).send(`Error occurred during testing. ${err}`)
    }
})


server.listen(PORT, (socket) => {
    let server_env = (env == 'development') ? 'DEV' : 'PROD'
    console.log(`Server[${server_env}] running at ${HOST}:${PORT}`)
    
    if (env != 'development') {
        app_server.uselambda = true
        console.log("[PROD] server, default to lambda functions")
        app_server.enableMonitor = true
        if (!app_server.game_type_monitor_interval) {
            app_server.setupTwitchMonitor()
        }
        console.log("[PROD] server, default to twitch monitor on")
        app_server.ffmpegCmd[0] = 'ffmpeg'
        console.log("[PROD] server, change to installed FFMPEG")
    }
})