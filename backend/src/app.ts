
import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api';

const app = express();

app.use(cors()); // Permite acesso do Frontend React
app.use(express.json()); // Parser JSON

app.use('/api', apiRoutes);

// Middleware de Erro Global
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno no sistema de estoque.' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend ERP (Estoque) rodando na porta ${PORT}`);
});
