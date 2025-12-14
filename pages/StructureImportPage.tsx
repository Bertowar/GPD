import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle, Layers, Database, Box, Tag, AlertCircle, Loader2 } from 'lucide-react';
import { upsertProductBatch, upsertMaterialBatch, upsertBOMBatch, formatError } from '../services/storage';
import { Product } from '../types';

// Simple interface for internal state
interface ImportedStructure {
    parent: Partial<Product>;
    components: {
        code: string;
        name: string;
        qty: number;
        unit: string;
        category?: string;
        group?: string;
    }[];
}

const StructureImportPage: React.FC = () => {
    const [step, setStep] = useState<number>(1);
    const [parsedData, setParsedData] = useState<ImportedStructure[]>([]);
    const [processing, setProcessing] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [parseError, setParseError] = useState('');
    const [progress, setProgress] = useState(0);

    // --- LOGIC ---

    const classifyComponent = (name: string, unit: string) => {
        if (!name) return { cat: 'raw_material', group: 'Diversos' };
        const n = name.toUpperCase();
        
        if (n.includes('BOB PIC') || n.includes('PICOTADA')) return { cat: 'packaging', group: 'Embalagem Plástica' };
        if (n.includes('CX.') || n.includes('CAIXA') || n.includes('PAPELAO')) return { cat: 'packaging', group: 'Caixas' };
        if (n.includes('FITA')) return { cat: 'packaging', group: 'Fitas' };
        if (n.includes('SACO') || n.includes('PLASTICO')) return { cat: 'packaging', group: 'Embalagem Plástica' };
        if (n.includes('ETIQUETA')) return { cat: 'packaging', group: 'Etiquetas' };
        if (n.includes('BOB') || n.includes('BOBINA') || n.includes('FILME')) return { cat: 'raw_material', group: 'Bobinas' };
        if (unit === 'KG') return { cat: 'raw_material', group: 'Matéria Prima (Geral)' };
        
        return { cat: 'raw_material', group: 'Diversos' };
    };

    const parseFile = (text: string) => {
        const lines = text.split(/\r?\n/);
        const structures: ImportedStructure[] = [];
        
        let currentParent: Partial<Product> | null = null;
        let currentComponents: any[] = [];

        // Regex: "Produto: 9008 ..."
        const parentRegex = /Produto\s*:\s*(\d+)\s+(.+?)(?:\s+Ref|\s+Unid|$)/i;
        
        // Regex: "1001 BOBINA... 1,000 KG"
        const componentRegex = /^\s*(\d+)\s+(.+?)\s+([0-9.,]+)\s+([A-Za-z]{2,})/;

        lines.forEach((line) => {
            if (!line || line.trim().length < 5 || line.includes('-----') || line.includes('.....')) return;

            // Check Parent
            const parentMatch = line.match(parentRegex);
            if (parentMatch) {
                if (currentParent) {
                    structures.push({ parent: currentParent, components: currentComponents });
                }
                const codeStr = parentMatch[1];
                const nameStr = parentMatch[2] ? parentMatch[2].trim() : 'Produto Sem Nome';
                
                currentParent = {
                    codigo: parseInt(codeStr, 10),
                    produto: nameStr,
                    type: 'FINISHED',
                    category: 'ARTICULADO',
                    unit: 'un'
                };
                currentComponents = [];
                return;
            }

            // Check Component
            if (currentParent) {
                const compMatch = line.match(componentRegex);
                if (compMatch) {
                    const rawCode = compMatch[1];
                    const rawName = compMatch[2].trim();
                    const rawQty = compMatch[3];
                    const rawUnit = compMatch[4];

                    const code = rawCode.replace(/^0+/, '') || '0';
                    
                    if (parseInt(code) === currentParent.codigo) return;

                    let qtyStr = rawQty;
                    if (qtyStr.includes('.') && qtyStr.includes(',')) {
                        qtyStr = qtyStr.replace(/\./g, '').replace(',', '.');
                    } else if (qtyStr.includes(',')) {
                        qtyStr = qtyStr.replace(',', '.');
                    }
                    
                    const qty = parseFloat(qtyStr);
                    if (isNaN(qty)) return;

                    const classification = classifyComponent(rawName, rawUnit);

                    currentComponents.push({
                        code: code,
                        name: rawName,
                        qty: qty,
                        unit: rawUnit,
                        category: classification.cat,
                        group: classification.group
                    });
                }
            }
        });

        if (currentParent) {
            structures.push({ parent: currentParent, components: currentComponents });
        }

        return structures;
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setParseError('');

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            if (text) {
                try {
                    const data = parseFile(text);
                    if (!data || data.length === 0) {
                        setParseError("Nenhum dado encontrado. Verifique o formato do arquivo.");
                        return;
                    }
                    setParsedData(data);
                    setStep(2);
                } catch (err: any) {
                    console.error(err);
                    setParseError("Erro ao ler arquivo: " + (err.message || 'Erro desconhecido'));
                }
            }
        };
        reader.readAsText(file, 'ISO-8859-1'); 
    };

    const handleImport = async () => {
        setStep(3);
        setProcessing(true);
        setStatusMsg("Iniciando importação...");
        setProgress(5);

        try {
            const allProducts: Partial<Product>[] = [];
            const allMaterials: any[] = [];
            const allBOMs: any[] = [];
            const materialCodeSet = new Set<string>();

            parsedData.forEach(struct => {
                if (struct.parent && struct.parent.codigo) {
                    allProducts.push(struct.parent);
                }
                
                struct.components.forEach(comp => {
                    if (!materialCodeSet.has(comp.code)) {
                        allMaterials.push({
                            code: comp.code,
                            name: comp.name,
                            unit: comp.unit,
                            category: comp.category,
                            group: comp.group,
                            active: true
                        });
                        materialCodeSet.add(comp.code);
                    }

                    if (struct.parent.codigo) {
                        allBOMs.push({
                            productCode: struct.parent.codigo,
                            materialCode: comp.code,
                            qty: comp.qty
                        });
                    }
                });
            });

            setStatusMsg(`Processando ${allProducts.length} Produtos...`);
            await upsertProductBatch(allProducts);
            setProgress(40);

            setStatusMsg(`Catalogando ${allMaterials.length} Materiais...`);
            await upsertMaterialBatch(allMaterials);
            setProgress(70);

            setStatusMsg(`Vinculando ${allBOMs.length} Itens de Receita...`);
            await upsertBOMBatch(allBOMs);
            setProgress(100);

            setStatusMsg("Importação Concluída!");
            setProcessing(false);

        } catch (e: any) {
            console.error(e);
            setStatusMsg("Erro Fatal: " + formatError(e));
            setProcessing(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-800">Importador de Estruturas (BOM)</h2>
                <p className="text-slate-500">Transforme relatórios de texto em cadastro de Produtos e Fichas Técnicas.</p>
            </div>

            {/* Step 1 */}
            {step === 1 && (
                <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:border-brand-400 transition-colors">
                    <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-2">Selecione o arquivo .TXT</h3>
                    
                    {parseError && (
                        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center justify-center text-sm font-medium border border-red-200">
                            <AlertCircle size={18} className="mr-2" />
                            {parseError}
                        </div>
                    )}

                    <label className="cursor-pointer bg-brand-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-brand-700 transition-colors shadow-lg inline-flex items-center">
                        <Upload size={20} className="mr-2" /> Escolher Arquivo
                        <input type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
                    </label>
                </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
                <div className="space-y-6">
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-start">
                        <AlertTriangle className="text-blue-600 mr-3 mt-0.5" size={20} />
                        <div>
                            <h4 className="font-bold text-blue-800">Resumo da Análise</h4>
                            <p className="text-sm text-blue-700 mt-1">
                                Foram identificados <b>{parsedData.length} Produtos Pais</b> e <b>{parsedData.reduce((acc, p) => acc + p.components.length, 0)} Componentes</b>.
                            </p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="max-h-[500px] overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                                    <tr>
                                        <th className="px-6 py-3">Estrutura</th>
                                        <th className="px-6 py-3">Classificação</th>
                                        <th className="px-6 py-3 text-right">Qtd Base</th>
                                        <th className="px-6 py-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {parsedData.slice(0, 50).map((struct, idx) => (
                                        <React.Fragment key={idx}>
                                            <tr className="bg-slate-50/50">
                                                <td className="px-6 py-3">
                                                    <div className="flex items-center">
                                                        <Layers className="text-brand-600 mr-2" size={18} />
                                                        <div>
                                                            <div className="font-bold text-slate-800">{struct.parent.produto}</div>
                                                            <div className="text-xs text-slate-500 font-mono">CÓD: {struct.parent.codigo}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3"><span className="text-xs font-bold bg-white border px-2 py-1 rounded text-slate-600">PAI</span></td>
                                                <td className="px-6 py-3 text-right font-mono text-slate-400">1.0</td>
                                                <td className="px-6 py-3 text-center"><CheckCircle2 size={16} className="text-green-500 mx-auto" /></td>
                                            </tr>
                                            {struct.components.map((comp, cIdx) => (
                                                <tr key={`${idx}-${cIdx}`} className="hover:bg-slate-50">
                                                    <td className="px-6 py-2 pl-12 border-l-4 border-l-transparent hover:border-l-brand-300">
                                                        <div className="text-slate-700 font-medium">{comp.name}</div>
                                                        <div className="text-[10px] text-slate-400 font-mono">{comp.code}</div>
                                                    </td>
                                                    <td className="px-6 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <Tag size={14} className="text-slate-400"/>
                                                            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{comp.group}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-2 text-right font-mono text-slate-600">
                                                        {comp.qty} {comp.unit}
                                                    </td>
                                                    <td className="px-6 py-2 text-center"><span className="text-[10px] text-blue-600 font-bold">Vincular</span></td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                    {parsedData.length > 50 && (
                                        <tr><td colSpan={4} className="text-center py-4 text-slate-500 italic">...e mais {parsedData.length - 50} estruturas</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-4 border-t border-slate-200">
                        <button onClick={() => { setStep(1); setParsedData([]); }} className="px-6 py-3 border border-slate-300 rounded-lg font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                        <button onClick={handleImport} className="px-8 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg flex items-center">
                            <Database size={18} className="mr-2" /> Confirmar Importação
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3 */}
            {step === 3 && (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm">
                    {processing ? (
                        <>
                            <Loader2 size={48} className="text-brand-600 animate-spin mb-6" />
                            <h3 className="text-xl font-bold text-slate-800 mb-2">Importando...</h3>
                            <p className="text-slate-500 mb-8">{statusMsg}</p>
                            <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${statusMsg.includes('Erro') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                {statusMsg.includes('Erro') ? <AlertTriangle size={32} /> : <CheckCircle2 size={32} />}
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">{statusMsg.includes('Erro') ? 'Falha' : 'Sucesso!'}</h3>
                            <p className="text-slate-500 mb-8">{statusMsg}</p>
                            <button onClick={() => { setStep(1); setParsedData([]); }} className="px-6 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900">Voltar ao Início</button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default StructureImportPage;