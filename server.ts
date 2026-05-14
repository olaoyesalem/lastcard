import 'dotenv/config'
import { createServer } from 'http'
import next from 'next'
import { initSocketServer } from './src/server/socketServer'

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3000')
const socketPort = parseInt(process.env.SOCKET_PORT || (dev ? '3001' : String(port)))

const app = next({ dev, hostname, port })
const handler = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer(handler)
  const socketServer = socketPort === port ? httpServer : createServer()
  initSocketServer(socketServer)

  if (socketPort !== port) {
    socketServer.listen(socketPort, hostname, () => {
      console.log(`> Socket server ready on port ${socketPort}`)
    })
  }

  httpServer.listen(port, hostname, () => {
    console.log(`> LastCard ready on port ${port}`)
  })
})
