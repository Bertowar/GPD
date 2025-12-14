
import { getClient } from '../config/db';
import { StockMovementInput, ProductionData, ServiceResponse } from '../types';

export class InventoryService {
  
  /**
   * Processa uma entrada ou saída de estoque com controle transacional ACID.
   */
  async processMovement(data: StockMovementInput): Promise<ServiceResponse<any>> {
    const client = await getClient();
    
    try {
      await client.query('BEGIN'); // Inicia Transação

      // 1. Validações Básicas
      if (data.quantity <= 0) throw new Error("Quantidade deve ser maior que zero.");

      let lotId = null;

      // 2. Lógica de Entrada (IN)
      if (data.type === 'IN') {
        if (!data.lot_number) throw new Error("Número do lote é obrigatório para entradas.");
        
        // Cria ou recupera o Lote
        const lotRes = await client.query(
          `INSERT INTO stock_lots (material_id, lot_number, supplier, expiration_date, initial_quantity, current_quantity)
           VALUES ($1, $2, $3, $4, $5, $5)
           RETURNING id`,
          [data.material_id, data.lot_number, data.supplier, data.expiration_date, data.quantity]
        );
        lotId = lotRes.rows[0].id;
      
      } 
      // 3. Lógica de Saída/Consumo (OUT) - Estratégia FIFO (First-In, First-Out)
      else if (data.type.startsWith('OUT')) {
        // Verifica estoque total
        const matRes = await client.query('SELECT current_stock, name FROM raw_materials WHERE id = $1', [data.material_id]);
        if (matRes.rows[0].current_stock < data.quantity) {
          throw new Error(`Estoque insuficiente para ${matRes.rows[0].name}. Atual: ${matRes.rows[0].current_stock}`);
        }

        let remainingQty = data.quantity;
        
        // Busca lotes com saldo, ordenados por data de validade (FEFO) ou criação (FIFO)
        const lots = await client.query(
          `SELECT id, current_quantity FROM stock_lots 
           WHERE material_id = $1 AND current_quantity > 0 AND status = 'APPROVED'
           ORDER BY expiration_date ASC, created_at ASC 
           FOR UPDATE`, // Trava as linhas para evitar condição de corrida
          [data.material_id]
        );

        for (const lot of lots.rows) {
          if (remainingQty <= 0) break;

          const take = Math.min(lot.current_quantity, remainingQty);
          
          // Atualiza saldo do lote
          await client.query(
            `UPDATE stock_lots SET current_quantity = current_quantity - $1 WHERE id = $2`,
            [take, lot.id]
          );

          // Registra movimento parcial do lote
          await client.query(
            `INSERT INTO stock_movements (material_id, lot_id, type, quantity, related_entry_id, operator_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [data.material_id, lot.id, data.type, take, data.related_entry_id, data.operator_id]
          );

          remainingQty -= take;
        }
      }

      // 4. Atualiza Saldo Geral do Material (Cache)
      await client.query(
        `UPDATE raw_materials 
         SET current_stock = (SELECT COALESCE(SUM(current_quantity), 0) FROM stock_lots WHERE material_id = $1)
         WHERE id = $1`,
        [data.material_id]
      );

      // 5. Verifica Alertas (Ponto de Reorder)
      await this.checkAlerts(client, data.material_id);

      await client.query('COMMIT'); // Confirma Transação
      return { success: true, data: { message: "Movimentação processada com sucesso." } };

    } catch (error: any) {
      await client.query('ROLLBACK'); // Desfaz tudo em caso de erro
      console.error("Erro na transação de estoque:", error);
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  }

  /**
   * Integração com Produção: Recebe o apontamento e baixa os materiais automaticamente.
   */
  async integrateProduction(prodData: ProductionData): Promise<ServiceResponse<any>> {
    const client = await getClient();
    try {
      // 1. Buscar Receita (BOM)
      const bomRes = await client.query(
        `SELECT material_id, quantity_required, waste_percentage 
         FROM product_bom WHERE product_code = $1`,
        [prodData.product_code]
      );

      if (bomRes.rows.length === 0) {
        return { success: false, error: "Ficha técnica (BOM) não encontrada para este produto." };
      }

      const movements: StockMovementInput[] = [];

      // 2. Calcular consumo para cada material
      for (const item of bomRes.rows) {
        const baseConsumption = Number(item.quantity_required) * prodData.quantity_produced;
        const waste = baseConsumption * (Number(item.waste_percentage) / 100);
        const totalToConsume = baseConsumption + waste;

        movements.push({
          material_id: item.material_id,
          type: 'OUT_PROD',
          quantity: totalToConsume,
          operator_id: prodData.operator_id,
          related_entry_id: prodData.production_entry_id
        });
      }

      // 3. Executar baixas (reutiliza a lógica segura processMovement)
      // Nota: Idealmente faríamos tudo numa única transação grande, aqui faremos em loop
      // para simplificar, mas mantendo a integridade individual.
      for (const move of movements) {
        const res = await this.processMovement(move);
        if (!res.success) throw new Error(`Falha ao baixar material ${move.material_id}: ${res.error}`);
      }

      return { success: true, data: { consumed_materials: movements.length } };

    } catch (error: any) {
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  }

  private async checkAlerts(client: any, materialId: string) {
    const res = await client.query(
      `SELECT name, current_stock, min_stock FROM raw_materials WHERE id = $1`, 
      [materialId]
    );
    const mat = res.rows[0];

    if (mat && mat.current_stock <= mat.min_stock) {
      await client.query(
        `INSERT INTO inventory_alerts (material_id, alert_type, message)
         VALUES ($1, 'LOW_STOCK', $2)
         ON CONFLICT DO NOTHING`, // Evita spam de alertas
        [materialId, `Estoque de ${mat.name} atingiu nível crítico: ${mat.current_stock}`]
      );
    }
  }
}
