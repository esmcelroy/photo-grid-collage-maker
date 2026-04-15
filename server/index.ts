import express from 'express'
import cors from 'cors'
import { collagesRouter } from './routes/collages'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5000'] }))
app.use(express.json({ limit: '50mb' }))

app.use('/api', collagesRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

export { app }

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}
