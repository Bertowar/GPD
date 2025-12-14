
import { Request, Response } from 'express';
import { InventoryService } from '../services/InventoryService';

const inventoryService = new InventoryService();

export class InventoryController {
  
  async createMaterial(req: Request, res: Response) {
    // Implementar criação com validação de campos dinâmicos
    res.status(501).json({ message: "Not implemented yet" });
  }

  async moveStock(req: Request, res: Response) {
    try {
      const result = await inventoryService.processMovement(req.body);
      if (result.success) {
        res.status(200).json(result.data);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (e) {
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  }

  async registerConsumption(req: Request, res: Response) {
    // Endpoint chamado pelo sistema de apontamento de produção
    try {
      const { product_code, quantity, operator_id, entry_id } = req.body;
      
      const result = await inventoryService.integrateProduction({
        production_entry_id: entry_id,
        product_code,
        quantity_produced: quantity,
        operator_id,
        timestamp: new Date()
      });

      if (result.success) {
        res.status(200).json(result.data);
      } else {
        res.status(422).json({ error: result.error }); // 422 Unprocessable Entity (ex: falta estoque)
      }
    } catch (e) {
      res.status(500).json({ error: "Erro ao processar consumo de produção" });
    }
  }

  async getAlerts(req: Request, res: Response) {
    // Retorna alertas ativos
    res.status(200).json([]);
  }
}
