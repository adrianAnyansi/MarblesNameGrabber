import HyperExpress from 'hyper-express'
const server = new HyperExpress.Server()

server.all('/alive', (req, resp) => {
    console.log('.')
    resp.send('5alive')
})

server.listen(4001)
.then( socket => {console.log("Hyper Express running on 4001")})
.catch( error => console.log("Error occurred", error))