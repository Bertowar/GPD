
import { Router } from 'express';
import { InventoryController } from '../controllers/InventoryController';

const router = Router();
const controller = new InventoryController();

// Matéria Prima
router.post('/raw-materials', controller.createMaterial);

// Movimentação Manual (Entrada Nota Fiscal / Ajuste)
router.post('/stock-movements', controller.moveStock);

// Integração com Produção (Baixa Automática)
router.post('/material-consumption', controller.registerConsumption);

// Alertas
router.get('/alerts', controller.getAlerts);

export default router;
