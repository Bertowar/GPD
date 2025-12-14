
import React, { useState, useEffect } from 'react';
import { Save, Loader2, AlertCircle, Plus, Trash2, Sliders, AlertTriangle, ShieldCheck, Target, ClipboardList } from 'lucide-react';
import { fetchSettings, saveSettings, fetchFieldDefinitions, saveFieldDefinition, deleteFieldDefinition, formatError } from '../services/storage';
import { AppSettings, FieldDefinition } from '../types';
import { Input } from '../components/Input';

const SettingsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  
  // Global Settings State
  const [settings, setSettings] = useState<AppSettings>({
    shiftHours: 8.8,
    efficiencyTarget: 85,
    maintenanceMode: false,
    requireScrapReason: true,
    blockExcessProduction: false,
    requireDowntimeNotes: false,
    enableProductionOrders: true
  });

  // Custom Fields State
  const [customFields, setCustomFields] = useState<FieldDefinition[]>([]);
  const [newField, setNewField] = useState<FieldDefinition>({
    key: '', label: '', type: 'text', section: 'production', required: false
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsData, fieldsData] = await Promise.all([
        fetchSettings(),
        fetchFieldDefinitions()
      ]);
      setSettings(settingsData);
      setCustomFields(fieldsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGlobalSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSettings(settings);
      setMsg('Configurações salvas com sucesso!');
      setTimeout(() => setMsg(''), 3000);
      // Force reload to update layout banner
      window.dispatchEvent(new Event('alert-update'));
    } catch (e) {
      setMsg('Erro ao salvar: ' + formatError(e));
    } finally {
      setSaving(false);
    }
  };

  // Custom Field Handlers
  const handleAddField = async (e: React.MouseEvent) => {
      e.preventDefault();
      if (!newField.key || !newField.label) return alert("Preencha chave e rótulo");
      try {
          await saveFieldDefinition(newField);
          await loadData();
          setNewField({ key: '', label: '', type: 'text', section: 'production', required: false });
      } catch(e) { alert("Erro ao adicionar campo: " + formatError(e)); }
  };

  const handleDeleteField = async (key: string, e: React.MouseEvent) => {
      e.preventDefault();
      if (!confirm("Desativar este campo?")) return;
      try {
          await deleteFieldDefinition(key);
          await loadData();
      } catch(e) { alert("Erro ao remover campo: " + formatError(e)); }
  };

  // UI Component for Toggles
  const ToggleSetting = ({ 
    label, 
    description, 
    checked, 
    onChange,
    icon
  }: { label: string, description: string, checked: boolean, onChange: (val: boolean) => void, icon?: React.ReactNode }) => (
    <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg transition-colors hover:border-brand-200">
        <div className="flex-1 pr-4 flex items-start">
            {icon && <div className="mr-3 mt-0.5 text-slate-500">{icon}</div>}
            <div>
                <h4 className="text-sm font-bold text-slate-800">{label}</h4>
                <p className="text-xs text-slate-500 mt-1">{description}</p>
            </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
            <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={checked}
                onChange={e => onChange(e.target.checked)}
            />
            <div className={`w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${checked ? 'peer-checked:bg-brand-600' : ''}`}></div>
        </label>
    </div>
  );

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin mr-2" /> Carregando...</div>;
  }

  return (
    <div className="space-y-8 pb-20">
      
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Configurações do Sistema</h2>
            <p className="text-slate-500">Definição de parâmetros globais e regras de negócio.</p>
        </div>
        <button 
            onClick={handleGlobalSave}
            disabled={saving}
            className="h-10 px-6 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-bold flex items-center shadow-lg transform hover:-translate-y-0.5 transition-all"
        >
            {saving ? <Loader2 className="animate-spin mr-2" /> : <Save size={18} className="mr-2" />}
            {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-lg border flex items-center animate-in fade-in slide-in-from-top-2 ${msg.includes('Erro') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
            <AlertCircle size={20} className="mr-3 flex-shrink-0" /> <span className="font-medium">{msg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          
          {/* COLUMN 1: Parâmetros */}
          <div className="space-y-6">
              
              {/* Parâmetros Globais */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center space-x-2 mb-6 text-slate-800 border-b border-slate-100 pb-4">
                    <Target className="text-brand-600" />
                    <h3 className="text-lg font-bold">Parâmetros de Produção</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-6 mb-4">
                    <Input 
                        label="Horas por Turno (Ref)" 
                        type="number" 
                        step="0.1" 
                        value={settings.shiftHours} 
                        onChange={e => setSettings({...settings, shiftHours: Number(e.target.value)})}
                    />
                    <Input 
                        label="Meta OEE / Eficiência (%)" 
                        type="number" 
                        value={settings.efficiencyTarget} 
                        onChange={e => setSettings({...settings, efficiencyTarget: Number(e.target.value)})}
                    />
                </div>

                <div className="border-t border-slate-100 pt-4">
                     <ToggleSetting 
                        icon={<ClipboardList size={18} />}
                        label="Habilitar Ordens de Produção (PCP)"
                        description="Ativa o módulo de planejamento e gestão de OPs no menu principal."
                        checked={settings.enableProductionOrders}
                        onChange={val => setSettings({...settings, enableProductionOrders: val})}
                    />
                </div>
              </div>

              {/* Regras de Validação */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center space-x-2 mb-6 text-slate-800 border-b border-slate-100 pb-4">
                    <ShieldCheck className="text-brand-600" size={20} />
                    <h4 className="text-lg font-bold">Regras de Validação (Policy)</h4>
                </div>
                
                <div className="space-y-4">
                    <ToggleSetting 
                        label="Exigir Motivo de Refugo"
                        description="Impede salvar produção com refugo sem classificar o defeito."
                        checked={settings.requireScrapReason}
                        onChange={val => setSettings({...settings, requireScrapReason: val})}
                    />
                    <ToggleSetting 
                        label="Bloquear Excesso de Produção"
                        description="Impede registros que excedam a capacidade técnica (Peças/Hora) em +20%."
                        checked={settings.blockExcessProduction}
                        onChange={val => setSettings({...settings, blockExcessProduction: val})}
                    />
                    <ToggleSetting 
                        label="Exigir Observação em Paradas"
                        description="Torna o campo de observações obrigatório para qualquer registro de parada."
                        checked={settings.requireDowntimeNotes}
                        onChange={val => setSettings({...settings, requireDowntimeNotes: val})}
                    />
                </div>

                {/* Maintenance Mode Special Toggle */}
                <div className="mt-6 pt-6 border-t border-slate-100">
                    <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start gap-3 pr-4">
                            <div className="p-2 bg-white text-red-600 rounded-full shadow-sm">
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-red-800 text-sm">Modo de Manutenção</h4>
                                <p className="text-xs text-red-700 mt-1">
                                    Bloqueia novos apontamentos em todo o sistema. Apenas leitura.
                                </p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={settings.maintenanceMode}
                                onChange={e => setSettings({...settings, maintenanceMode: e.target.checked})}
                            />
                            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                        </label>
                    </div>
                </div>
              </div>
          </div>

          {/* COLUMN 2: Campos Extras */}
          <div className="space-y-6">
              
              {/* Campos Personalizados */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center space-x-2 mb-6 text-slate-800 border-b border-slate-100 pb-4">
                    <Sliders className="text-brand-600" />
                    <h3 className="text-lg font-bold">Campos Extras (Formulário)</h3>
                </div>
                
                <div className="mb-4 grid grid-cols-1 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="ID (Chave)" placeholder="lote_mp" value={newField.key} onChange={e => setNewField({...newField, key: e.target.value})} className="bg-white h-8 text-xs" />
                        <Input label="Rótulo" placeholder="Lote MP" value={newField.label} onChange={e => setNewField({...newField, label: e.target.value})} className="bg-white h-8 text-xs" />
                    </div>
                    <div className="grid grid-cols-3 gap-3 items-end">
                        <div className="col-span-1">
                            <select 
                                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs h-9"
                                value={newField.type}
                                onChange={e => setNewField({...newField, type: e.target.value as any})}
                            >
                                <option value="text">Texto</option>
                                <option value="number">Número</option>
                                <option value="boolean">Sim/Não</option>
                            </select>
                        </div>
                        <div className="col-span-1">
                             <select 
                                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs h-9"
                                value={newField.section}
                                onChange={e => setNewField({...newField, section: e.target.value as any})}
                            >
                                <option value="production">Prod.</option>
                                <option value="process">Proc.</option>
                                <option value="quality">Qual.</option>
                            </select>
                        </div>
                        <button type="button" onClick={handleAddField} className="h-9 bg-brand-600 text-white rounded hover:bg-brand-700 flex items-center justify-center">
                            <Plus size={16} />
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-3 py-2">Campo</th>
                                <th className="px-3 py-2">Tipo</th>
                                <th className="px-3 py-2 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {customFields.map(f => (
                                <tr key={f.key} className="hover:bg-slate-50">
                                    <td className="px-3 py-2">
                                        <div className="font-bold text-slate-700">{f.label}</div>
                                        <div className="text-slate-400 font-mono">{f.key}</div>
                                    </td>
                                    <td className="px-3 py-2"><span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{f.type}</span></td>
                                    <td className="px-3 py-2 text-right">
                                        <button type="button" onClick={(e) => handleDeleteField(f.key, e)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
              </div>

          </div>
      </div>
    </div>
  );
};

export default SettingsPage;
