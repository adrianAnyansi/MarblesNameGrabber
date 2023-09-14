/* Node Express Router
    Moving the Router/Server aspect away from the underlying code
*/

import express from 'express'
import { MarblesAppServer } from './MarblesUserName_Server.mjs';
// import HyperExpress from 'hyper-express'
import path from 'path'

const server = express()
const PORT = 4000;
const HOST = 'localhost'

const app_server = new MarblesAppServer()

// server.use(express.json()) // for parsing application/json
// server.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

// server.use((req, res, next) => {
//     res.append('Access-Control-Allow-Origin', ['*']);
//     res.append('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
//     res.append('Access-Control-Allow-Headers', 'Content-Type');
//     next();
// });

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
server.post(['/start', '/start/:streamName'], (req, res) => {
    
    const streamName = req.params.streamName
    res.json(app_server.start(streamName))

})

/**
 * Stop image parser
 * returns JSON indicating the result of stopping
 */
server.post('/stop', (req, res) => {
    res.json(app_server.stop())
})

/**
 * Clear usernameList
 */
server.post('/clear', (req, res) => {
    res.send(app_server.clear()) // TODO: Handle errors
})

server.get('/status', (req, res) => {
    // TODO: Create a user version with less detail
    res.json(app_server.status())
})

server.get('/find/:userName', (req, res) => {
    const reqUsername = req.params.userName
    console.debug(`Finding user ${reqUsername}`)
    return res.json(app_server.find(reqUsername))
})

server.get('/user_find/:userId', (req, res) => {
    const reqUsername = req.params.userId
    console.debug(`User-Find user ${reqUsername}`)

    return res.json(app_server.userFind(reqUsername))
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
    } else {
        const reqId = req.params.id
        console.debug(`Returning image num: ${reqId}`)
        userImage = app_server.getFullImg(reqId)
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

server.get('/debug', (req, res) => {

    let filename = req.query?.filename
    // if (!filename) filename = TEST_FILENAME

    try {
        res.send(app_server.debug(filename))    // FIXME: Add params for errors and etc
    } catch (err) {
        res.status(400).send(`An unknown error occured. ${err}`)
    }
    

    // debugRun(filename).then( ({mng, data}) => {
    //     let retList = usernameList.addPage(data, mng.bufferToPNG(mng.orig_buffer, true, false))
    //     res.send({list: retList, debug:true})
    //     console.debug("Sent debug response")
    // }).catch( err => {
    //     res.status(400).send(`An unknown error occurred. ${err}`)
    // })
})

server.listen(PORT, (socket) => {
    console.log(`Server running at ${HOST}:${PORT}`)
})