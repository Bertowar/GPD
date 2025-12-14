import React, { useState, useEffect, useMemo } from 'react';
import { Upload, FileText, Trash2, Calculator, Table as TableIcon, Loader2, ArrowLeft, Building2, Store, Calendar, AlertTriangle, Sigma, Layers, Search, Filter, Package, Database, Copy, Check, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../hooks/useQueries';

// Interfaces for Report Data
interface ReportItem {
    _id: number;
    ID: string;
    REFERENCIA: string;
    DESCRICAO: string; // Captured description
    LINHA: string;     // Extracted last word (LEVE, ULTRA, NOBRE)
    QTDADE: string; 
    TOTAL: string;  
    qtyValue: number; 
    totalValue: number; 
}

interface ReportSummary {
    totalQty: number;
    totalValue: number;
    totalIPI: number;
    fileName: string;
    fileSize: string;
    period: string; 
    rawPeriod: string; 
    identity?: string; 
}

// Interface for Merged Items
interface ConsolidatedItem {
    id: string;
    reference: string;
    line: string; // NEW: Explicit line
    origin: 'MATRIZ' | 'FILIAL' | 'AMBOS';
    qtyMatriz: number;
    qtyFilial: number;
    qtyTotal: number;
    valMatriz: number;
    valFilial: number;
    valTotal: number;
    // New Logic Fields
    splitString: string; // "50/50", "100/0" based on VALUE
    category: string; // Now dynamic based on extracted line (LEVE, ULTRA, NOBRE)
    isCellRed: boolean; // Controls cell background
    isRowRed: boolean;  // Controls row background
}

// Interface for Product Aggregation (Tab D)
interface ProductSummaryItem {
    reference: string;
    nobreId: string; // CHANGED: Replaced line with the unification ID (Nobre Code)
    qtyMatriz: number;
    valMatriz: number;
    qtyFilial: number;
    valFilial: number;
    qtyTotal: number;
    valTotal: number;
}

const LegacyImportPage: React.FC = () => {
    const navigate = useNavigate();
    const { data: dbProducts = [] } = useProducts(); // Fetch DB Products for matching

    const [activeTab, setActiveTab] = useState<'A' | 'B' | 'C' | 'D'>('A');
    const [isParsing, setIsParsing] = useState(false);
    
    // Divergence Alert State
    const [divergenceAlert, setDivergenceAlert] = useState<string | null>(null);

    // Export SQL State
    const [showExportModal, setShowExportModal] = useState(false);
    
    // --- STATE PERSISTENCE LOGIC (SAFE PARSING) ---
    const [reportA, setReportA] = useState<ReportItem[]>(() => {
        try {
            const saved = localStorage.getItem('pplast_import_reportA');
            const parsed = saved ? JSON.parse(saved) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    });
    const [summaryA, setSummaryA] = useState<ReportSummary>(() => {
        try {
            const saved = localStorage.getItem('pplast_import_summaryA');
            return saved ? JSON.parse(saved) : { totalQty: 0, totalValue: 0, totalIPI: 0, fileName: '', fileSize: '', period: '', rawPeriod: '' };
        } catch (e) { return { totalQty: 0, totalValue: 0, totalIPI: 0, fileName: '', fileSize: '', period: '', rawPeriod: '' }; }
    });

    const [reportB, setReportB] = useState<ReportItem[]>(() => {
        try {
            const saved = localStorage.getItem('pplast_import_reportB');
            const parsed = saved ? JSON.parse(saved) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    });
    const [summaryB, setSummaryB] = useState<ReportSummary>(() => {
        try {
            const saved = localStorage.getItem('pplast_import_summaryB');
            return saved ? JSON.parse(saved) : { totalQty: 0, totalValue: 0, totalIPI: 0, fileName: '', fileSize: '', period: '', rawPeriod: '' };
        } catch (e) { return { totalQty: 0, totalValue: 0, totalIPI: 0, fileName: '', fileSize: '', period: '', rawPeriod: '' }; }
    });

    // Save to LocalStorage on Change
    useEffect(() => { localStorage.setItem('pplast_import_reportA', JSON.stringify(reportA)); }, [reportA]);
    useEffect(() => { localStorage.setItem('pplast_import_summaryA', JSON.stringify(summaryA)); }, [summaryA]);
    useEffect(() => { localStorage.setItem('pplast_import_reportB', JSON.stringify(reportB)); }, [reportB]);
    useEffect(() => { localStorage.setItem('pplast_import_summaryB', JSON.stringify(summaryB)); }, [summaryB]);


    // FILTERS STATE
    const [filters, setFilters] = useState({
        id: '',
        ref: '',
        origin: ''
    });
    
    // Interactive Category Filter
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'LEVE' | 'ULTRA' | 'NOBRE' | null>(null);

    // Helper to parse BR number format (1.234,56 -> 1234.56)
    const parseBRNumber = (str: string) => {
        if (!str) return 0;
        return parseFloat(str.replace(/\./g, '').replace(',', '.'));
    };

    // CHECK FOR DATE DIVERGENCE
    useEffect(() => {
        if (summaryA.rawPeriod && summaryB.rawPeriod) {
            if (summaryA.rawPeriod !== summaryB.rawPeriod) {
                setDivergenceAlert(`Atenção: As datas dos relatórios não conferem!\n\nMatriz: ${summaryA.period}\nFilial: ${summaryB.period}`);
            } else {
                setDivergenceAlert(null);
            }
        } else {
            setDivergenceAlert(null);
        }
    }, [summaryA.rawPeriod, summaryB.rawPeriod]);

    // --- CONSOLIDATION LOGIC (MEMOIZED) ---
    const consolidatedData = useMemo(() => {
        const map = new Map<string, ConsolidatedItem>();

        // 1. Process MATRIZ (A)
        // Fix: Ensure reportA is array
        (reportA || []).forEach(item => {
            map.set(item.ID, {
                id: item.ID,
                reference: item.REFERENCIA,
                line: item.LINHA,
                origin: 'MATRIZ',
                qtyMatriz: item.qtyValue,
                qtyFilial: 0,
                qtyTotal: item.qtyValue,
                valMatriz: item.totalValue,
                valFilial: 0,
                valTotal: item.totalValue,
                splitString: '',
                category: item.LINHA || '', 
                isCellRed: false,
                isRowRed: false
            });
        });

        // 2. Process FILIAL (B)
        // Fix: Ensure reportB is array
        (reportB || []).forEach(item => {
            if (map.has(item.ID)) {
                // Merge if exists
                const existing = map.get(item.ID)!;
                existing.origin = 'AMBOS';
                existing.qtyFilial = item.qtyValue;
                existing.qtyTotal += item.qtyValue;
                existing.valFilial = item.totalValue;
                existing.valTotal += item.totalValue;
                
                // Priority to Matriz Line, else Filial
                if (!existing.line && item.LINHA) {
                    existing.line = item.LINHA;
                    existing.category = item.LINHA;
                }
            } else {
                // Add new if not exists
                map.set(item.ID, {
                    id: item.ID,
                    reference: item.REFERENCIA,
                    line: item.LINHA,
                    origin: 'FILIAL',
                    qtyMatriz: 0,
                    qtyFilial: item.qtyValue,
                    qtyTotal: item.qtyValue,
                    valMatriz: 0,
                    valFilial: item.totalValue,
                    valTotal: item.totalValue,
                    splitString: '',
                    category: item.LINHA || '',
                    isCellRed: false,
                    isRowRed: false
                });
            }
        });

        // 3. Post-Process for Split Categories & Rules
        const items = Array.from(map.values());
        
        items.forEach(item => {
            // -- Percentage Split (Based on Monetary VALUE) --
            const totalVal = item.valMatriz + item.valFilial;
            let pctMatriz = 0;
            let pctFilial = 0;

            if (totalVal > 0) {
                pctMatriz = Math.round((item.valMatriz / totalVal) * 100);
                pctFilial = 100 - pctMatriz;
            } else if (item.valMatriz === 0 && item.valFilial === 0) {
                // Edge case: Value 0 but quantity exists
                if(item.qtyMatriz > 0 && item.qtyFilial > 0) { pctMatriz=50; pctFilial=50; }
                else if (item.qtyMatriz > 0) { pctMatriz=100; pctFilial=0; }
                else { pctMatriz=0; pctFilial=100; }
            }

            item.splitString = `${pctMatriz}/${pctFilial}`;

            // -- Highlighting Rules (Deep Analysis) --
            item.isCellRed = false;
            item.isRowRed = false;
            
            // Normalize Category for Comparison
            const normCat = item.category ? item.category.toUpperCase().trim() : '';

            if (normCat === 'LEVE') {
                // LEVE Rule: Value Must be 50/50.
                if (pctMatriz !== 50) {
                    item.isCellRed = true;
                }
            } else if (normCat === 'ULTRA') {
                // ULTRA Rule: Value Must be 40/60.
                if (pctMatriz !== 40) {
                    item.isCellRed = true;
                }
                // Row Rule: If Cell Red -> Row Red (Strict check for Ultra)
                if (item.isCellRed) {
                    item.isRowRed = true;
                }
            }
        });

        // Convert map to array and sort by Reference
        return items.sort((a, b) => (a.reference || '').localeCompare(b.reference || ''));
    }, [reportA, reportB]);

    // --- AGGREGATION LOGIC (TAB D) ---
    const productSummaryData = useMemo(() => {
        const map = new Map<string, ProductSummaryItem>();

        consolidatedData.forEach(item => {
            // Group by REFERENCE
            const key = item.reference;
            
            if (!map.has(key)) {
                map.set(key, {
                    reference: item.reference,
                    nobreId: '-', // Default placeholder
                    qtyMatriz: 0,
                    valMatriz: 0,
                    qtyFilial: 0,
                    valFilial: 0,
                    qtyTotal: 0,
                    valTotal: 0
                });
            }
            
            const prod = map.get(key)!;
            
            prod.qtyMatriz += item.qtyMatriz;
            prod.valMatriz += item.valMatriz;
            prod.qtyFilial += item.qtyFilial;
            prod.valFilial += item.valFilial;
            
            // Recalculate Totals from sums
            prod.qtyTotal = prod.qtyMatriz + prod.qtyFilial;
            prod.valTotal = prod.valMatriz + prod.valFilial;

            // CAPTURE NOBRE ID (Unification Code)
            // If the current item is the 'NOBRE' line variant (and exists in Matriz), capture its ID.
            if (item.line && item.line.toUpperCase().includes('NOBRE') && (item.origin === 'MATRIZ' || item.origin === 'AMBOS')) {
                prod.nobreId = item.id;
            } else if (prod.nobreId === '-' && (item.origin === 'MATRIZ' || item.origin === 'AMBOS')) {
                // No specific fallback needed as per request, just keep finding the ID.
            }
        });

        return Array.from(map.values()).sort((a, b) => (a.reference || '').localeCompare(b.reference || ''));
    }, [consolidatedData]);


    const consolidatedSummary = useMemo(() => {
        const totalQty = consolidatedData.reduce((acc, item) => acc + item.qtyTotal, 0);
        const totalValue = consolidatedData.reduce((acc, item) => acc + item.valTotal, 0);
        const totalIPI = summaryA.totalIPI + summaryB.totalIPI;
        
        return { totalQty, totalValue, totalIPI, count: consolidatedData.length };
    }, [consolidatedData, summaryA.totalIPI, summaryB.totalIPI]);


    // SHARED PARSER LOGIC
    const parseReportFile = (file: File, targetReport: 'A' | 'B') => {
        setIsParsing(true);
        const reader = new FileReader();
        
        reader.onload = (evt) => {
            let text = evt.target?.result as string;
            if (!text) { setIsParsing(false); return; }

            // 1. Clean BOM
            text = text.replace(/^\uFEFF/, '');

            // 2. Identity & Validation Rules
            const matrizIdent = /MOVEIS\s+PERARO/i;
            const filialIdent = /-\*-\s*SISTEMA\s*-\*-/i;
            
            let detectedIdentity = undefined;

            if (matrizIdent.test(text)) detectedIdentity = "MOVEIS PERARO";
            else if (filialIdent.test(text)) detectedIdentity = "SISTEMA";
            else detectedIdentity = "DESCONHECIDO";

            if (targetReport === 'A' && !matrizIdent.test(text)) {
                alert("AVISO: O arquivo selecionado não contém a identificação 'MOVEIS PERARO'. Verifique se este é realmente o relatório da MATRIZ.");
            }
            if (targetReport === 'B' && !filialIdent.test(text)) {
                alert("AVISO: O arquivo selecionado não contém a identificação '-*- SISTEMA -*-'. Verifique se este é realmente o relatório da FILIAL.");
            }

            // 3. Extract Period
            const periodRegex = /Per.*?odo\s+.*?(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i;
            const headerLines = text.split(/\r?\n/).slice(0, 20).join('\n');
            const periodMatch = headerLines.match(periodRegex);
            
            let periodDisplay = 'Não identificado';
            let periodRaw = '';

            if (periodMatch) {
                periodDisplay = `${periodMatch[1]} a ${periodMatch[2]}`;
                periodRaw = periodDisplay;
            }

            // 4. Extract Line Items (UPDATED REGEX LOGIC)
            const lines = text.split(/\r?\n/);
            const data: ReportItem[] = [];
            let accQty = 0;
            let accValue = 0;

            // REGEX STRUCTURE:
            // G1: ID (\d+)
            // G2: DESCRIPTION (.+?) - Lazy match
            // G3: REFERENCE ([^\s]+) - The repeated code
            // G4: BRAND ([^\s]+)
            // Anchor: CX
            // G5: QTY
            // G6: TOTAL
            const itemRegex = /^(\d+)\s+(.+?)\s+([^\s]+)\s+([^\s]+)\s+CX\s+([0-9\.]+,\d+)\s+([0-9\.]+,\d{2})/;
            
            const ipiRegex = /(?:TOTAL|VALOR|VLR)\.?\s*(?:DO\s+)?IPI.*?\s([0-9\.]+,\d{2})/i;

            lines.forEach((line, index) => {
                const match = line.match(itemRegex);
                if (match) {
                    const id = match[1];
                    const rawDesc = match[2].trim(); 
                    const ref = match[3]; 
                    const qtyStr = match[5];
                    const totalStr = match[6];

                    // Extract LINHA (Last word of description)
                    const descParts = rawDesc.split(/\s+/);
                    const lastWord = descParts.length > 0 ? descParts[descParts.length - 1] : '';
                    const extractedLine = lastWord.trim(); 

                    const qty = parseBRNumber(qtyStr);
                    const total = parseBRNumber(totalStr);
                    accQty += qty;
                    accValue += total;
                    
                    data.push({
                        _id: index,
                        'ID': id,
                        'REFERENCIA': ref,
                        'DESCRICAO': rawDesc,
                        'LINHA': extractedLine,
                        'QTDADE': qtyStr,
                        'TOTAL': totalStr,
                        qtyValue: qty,
                        totalValue: total
                    });
                }
            });

            const ipiMatch = text.match(ipiRegex);
            let totalIPI = 0;
            if (ipiMatch) totalIPI = parseBRNumber(ipiMatch[1]);

            const newSummary: ReportSummary = {
                totalQty: accQty,
                totalValue: accValue,
                totalIPI: totalIPI,
                fileName: file.name,
                fileSize: (file.size / 1024).toFixed(1) + ' KB',
                period: periodDisplay,
                rawPeriod: periodRaw,
                identity: detectedIdentity
            };

            if (targetReport === 'A') { setReportA(data); setSummaryA(newSummary); } 
            else { setReportB(data); setSummaryB(newSummary); }
            setIsParsing(false);
        };

        reader.readAsText(file, 'ISO-8859-1');
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (activeTab === 'C' || activeTab === 'D') return;
        if (file) parseReportFile(file, activeTab);
        e.target.value = '';
    };

    const handleClear = () => {
        if (activeTab === 'A') {
            setReportA([]);
            setSummaryA({ totalQty: 0, totalValue: 0, totalIPI: 0, fileName: '', fileSize: '', period: '', rawPeriod: '' });
        } else if (activeTab === 'B') {
            setReportB([]);
            setSummaryB({ totalQty: 0, totalValue: 0, totalIPI: 0, fileName: '', fileSize: '', period: '', rawPeriod: '' });
        }
    };

    // Replaced SQL generation with Modal Opener
    const handleOpenExportModal = () => {
        if (consolidatedData.length === 0) return;
        setShowExportModal(true);
    };

    const handleCategoryClick = (category: 'LEVE' | 'ULTRA' | 'NOBRE') => {
        if (selectedCategoryFilter === category) {
            setSelectedCategoryFilter(null); // Toggle off
        } else {
            setSelectedCategoryFilter(category);
        }
    };

    const filterData = (data: ReportItem[]) => {
        return data.filter(item => {
            const matchId = !filters.id || item.ID.includes(filters.id);
            const matchRef = !filters.ref || item.REFERENCIA.toLowerCase().includes(filters.ref.toLowerCase());
            return matchId && matchRef;
        });
    };

    const filterConsolidated = (data: ConsolidatedItem[]) => {
        return data.filter(item => {
            const matchId = !filters.id || item.id.includes(filters.id);
            const matchRef = !filters.ref || item.reference.toLowerCase().includes(filters.ref.toLowerCase());
            const matchCategory = !selectedCategoryFilter || item.category === selectedCategoryFilter;
            return matchId && matchRef && matchCategory;
        });
    };

    // Apply filters to Product Summary (Tab D) 
    const filteredProductSummary = productSummaryData.filter(item => {
        const matchRef = !filters.ref || item.reference.toLowerCase().includes(filters.ref.toLowerCase());
        // Added ID filter for Tab D as well since we have a dedicated column now
        const matchId = !filters.id || item.nobreId.includes(filters.id);
        return matchRef && matchId;
    });

    const currentReport = activeTab === 'A' ? reportA : reportB;
    const currentSummary = activeTab === 'A' ? summaryA : summaryB;
    const filteredReport = filterData(currentReport);
    const filteredConsolidated = filterConsolidated(consolidatedData);

    return (
        <div className="space-y-6 pb-20 animate-in fade-in">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <button onClick={() => navigate('/logistics')} className="text-slate-500 hover:text-brand-600 flex items-center mb-1 text-sm font-bold transition-colors">
                        <ArrowLeft size={16} className="mr-1" /> Voltar para Logística
                    </button>
                    <h2 className="text-2xl font-bold text-slate-800">Conferência Matriz vs Filial</h2>
                    <p className="text-slate-500">Importação e consolidação de relatórios de venda.</p>
                </div>
            </div>

            {/* DIVERGENCE ALERT POPUP */}
            {divergenceAlert && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-in zoom-in-95">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border-2 border-red-500">
                        <div className="bg-red-50 p-6 flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle size={32} className="text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold text-red-700 mb-2">Divergência de Período</h3>
                            <p className="text-slate-700 whitespace-pre-line mb-6 font-medium">
                                {divergenceAlert}
                            </p>
                            <button onClick={() => setDivergenceAlert(null)} className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors w-full">
                                Entendido, revisar arquivos
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px] flex flex-col">
                
                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                    <button onClick={() => { setActiveTab('A'); setFilters({id:'', ref:'', origin:''}); }} className={`flex-1 py-3 text-center border-b-2 transition-all flex flex-col items-center justify-center gap-1 ${activeTab === 'A' ? 'border-brand-600 bg-brand-50/50' : 'border-transparent hover:bg-slate-50'}`}>
                        <div className={`flex items-center font-bold text-sm ${activeTab === 'A' ? 'text-brand-600' : 'text-slate-500'}`}>
                            <Building2 size={18} className="mr-2" /> MATRIZ
                            {(reportA || []).length > 0 && <span className="ml-2 bg-brand-200 text-brand-800 text-[10px] px-2 py-0.5 rounded-full">{reportA.length}</span>}
                        </div>
                        {summaryA.identity && <span className={`text-[10px] font-bold px-2 py-0.5 rounded shadow-sm animate-in zoom-in ${activeTab === 'A' ? 'text-white bg-brand-600' : 'text-slate-300 bg-slate-100'}`}>{summaryA.identity}</span>}
                    </button>
                    <div className="w-px bg-slate-200"></div>
                    <button onClick={() => { setActiveTab('B'); setFilters({id:'', ref:'', origin:''}); }} className={`flex-1 py-3 text-center border-b-2 transition-all flex flex-col items-center justify-center gap-1 ${activeTab === 'B' ? 'border-purple-600 bg-purple-50/50' : 'border-transparent hover:bg-slate-50'}`}>
                        <div className={`flex items-center font-bold text-sm ${activeTab === 'B' ? 'text-purple-600' : 'text-slate-500'}`}>
                            <Store size={18} className="mr-2" /> FILIAL
                            {(reportB || []).length > 0 && <span className="ml-2 bg-purple-200 text-purple-800 text-[10px] px-2 py-0.5 rounded-full">{reportB.length}</span>}
                        </div>
                        {summaryB.identity && <span className={`text-[10px] font-bold px-2 py-0.5 rounded shadow-sm animate-in zoom-in ${activeTab === 'B' ? 'text-white bg-purple-600' : 'text-slate-300 bg-slate-100'}`}>{summaryB.identity}</span>}
                    </button>
                    <div className="w-px bg-slate-200"></div>
                    <button onClick={() => { setActiveTab('C'); setFilters({id:'', ref:'', origin:''}); }} className={`flex-1 py-3 text-center border-b-2 transition-all flex flex-col items-center justify-center gap-1 ${activeTab === 'C' ? 'border-blue-600 bg-blue-50/50' : 'border-transparent hover:bg-slate-50'}`}>
                        <div className={`flex items-center font-bold text-sm ${activeTab === 'C' ? 'text-blue-600' : 'text-slate-500'}`}>
                            <Sigma size={18} className="mr-2" /> CONSOLIDADO
                            {consolidatedData.length > 0 && <span className="ml-2 bg-blue-200 text-blue-800 text-[10px] px-2 py-0.5 rounded-full">{consolidatedData.length}</span>}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded shadow-sm ${activeTab === 'C' ? 'text-white bg-blue-600' : 'text-slate-300 bg-slate-100'}`}>MATRIZ + FILIAL</span>
                    </button>
                    <div className="w-px bg-slate-200"></div>
                    <button onClick={() => { setActiveTab('D'); setFilters({id:'', ref:'', origin:''}); }} className={`flex-1 py-3 text-center border-b-2 transition-all flex flex-col items-center justify-center gap-1 ${activeTab === 'D' ? 'border-green-600 bg-green-50/50' : 'border-transparent hover:bg-slate-50'}`}>
                        <div className={`flex items-center font-bold text-sm ${activeTab === 'D' ? 'text-green-600' : 'text-slate-500'}`}>
                            <Package size={18} className="mr-2" /> RESUMO PRODUTOS
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded shadow-sm ${activeTab === 'D' ? 'text-white bg-green-600' : 'text-slate-300 bg-slate-100'}`}>AGRUPADO</span>
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        {(activeTab === 'A' || activeTab === 'B') ? (
                            <>
                                {currentSummary.fileName ? (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold uppercase text-slate-400">Arquivo</span>
                                        <span className="font-mono text-sm font-bold text-slate-700">{currentSummary.fileName}</span>
                                    </div>
                                ) : (
                                    <span className="text-sm text-slate-400 italic flex items-center"><FileText size={16} className="mr-2"/> Nenhum arquivo.</span>
                                )}
                                {currentSummary.period && (
                                    <>
                                        <div className="hidden md:block w-px h-8 bg-slate-300 mx-2"></div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center"><Calendar size={10} className="mr-1"/> Período</span>
                                            <span className="font-mono text-sm font-bold text-brand-700">{currentSummary.period}</span>
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-bold text-slate-600 flex items-center bg-white px-3 py-1.5 rounded border border-slate-200">
                                    <Layers size={16} className="mr-2 text-blue-500" />
                                    {activeTab === 'C' ? 'Total Itens:' : 'Total Produtos:'} <b className="ml-1 text-slate-800">{activeTab === 'C' ? consolidatedSummary.count : productSummaryData.length}</b>
                                </span>
                                {selectedCategoryFilter && activeTab === 'C' && (
                                    <span className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-full animate-in fade-in">
                                        <Filter size={12} />
                                        Filtro: {selectedCategoryFilter}
                                        <button onClick={() => setSelectedCategoryFilter(null)} className="ml-1 hover:text-red-300"><Trash2 size={12}/></button>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 w-full md:w-auto justify-end">
                        {(activeTab === 'A' || activeTab === 'B') && (
                            <>
                                <label className={`cursor-pointer text-white px-4 py-2 rounded-lg font-bold shadow-sm flex items-center transition-all ${currentReport.length > 0 ? 'bg-slate-300 cursor-not-allowed opacity-70' : (activeTab === 'A' ? 'bg-brand-600 hover:bg-brand-700 active:scale-95' : 'bg-purple-600 hover:bg-purple-700 active:scale-95')}`}>
                                    <Upload size={18} className="mr-2" />
                                    {activeTab === 'A' ? 'Carregar Matriz' : 'Carregar Filial'}
                                    <input type="file" accept=".txt,.csv" className="hidden" onChange={handleFileUpload} disabled={currentReport.length > 0} />
                                </label>
                                {currentReport.length > 0 && (
                                    <button onClick={handleClear} className="p-2 border border-slate-300 bg-white rounded-lg hover:bg-red-50 hover:text-red-600 text-slate-500 transition-colors" title="Limpar"><Trash2 size={18} /></button>
                                )}
                            </>
                        )}
                        
                        {/* VIEW EXPORT / VERIFY DB BUTTON (Only on Tab C with data) */}
                        {activeTab === 'C' && consolidatedData.length > 0 && (
                            <button 
                                onClick={handleOpenExportModal}
                                className="flex items-center px-4 py-2 bg-slate-800 text-white rounded-lg font-bold shadow-sm hover:bg-slate-700 transition-all active:scale-95"
                            >
                                <Database size={18} className="mr-2" />
                                Conferência Banco
                            </button>
                        )}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-auto relative bg-white">
                    {isParsing ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <Loader2 className="animate-spin mb-2" size={32} />
                            <p>Processando...</p>
                        </div>
                    ) : (
                        <>
                            {/* REGULAR VIEW (A or B) */}
                            {(activeTab === 'A' || activeTab === 'B') && (
                                currentReport.length > 0 ? (
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                <th className="px-6 py-3 w-20 text-center text-slate-400">#</th>
                                                <th className="px-6 py-2">
                                                    <div className="flex flex-col gap-1">
                                                        <span>ID</span>
                                                        <div className="relative">
                                                            <Search size={10} className="absolute left-2 top-2 text-slate-400"/>
                                                            <input type="text" className="w-full pl-6 pr-2 py-1 text-[10px] border rounded outline-none focus:border-brand-500" placeholder="Filtrar" value={filters.id} onChange={e => setFilters({...filters, id: e.target.value})} />
                                                        </div>
                                                    </div>
                                                </th>
                                                <th className="px-6 py-2">
                                                    <div className="flex flex-col gap-1">
                                                        <span>Referência</span>
                                                        <div className="relative">
                                                            <Search size={10} className="absolute left-2 top-2 text-slate-400"/>
                                                            <input type="text" className="w-full pl-6 pr-2 py-1 text-[10px] border rounded outline-none focus:border-brand-500" placeholder="Filtrar" value={filters.ref} onChange={e => setFilters({...filters, ref: e.target.value})} />
                                                        </div>
                                                    </div>
                                                </th>
                                                <th className="px-6 py-3 text-left">Linha (Ext.)</th>
                                                <th className="px-6 py-3 text-right">Qtd (CX)</th>
                                                <th className="px-6 py-3 text-right">Total (R$)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredReport.map((row, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-2 text-center text-slate-400 text-xs font-mono">{idx + 1}</td>
                                                    <td className="px-6 py-2 font-mono text-slate-600">{row.ID}</td>
                                                    <td className="px-6 py-2 font-bold text-slate-800">
                                                        {row.REFERENCIA}
                                                        <span className="block text-[10px] text-slate-400 font-normal">{row.DESCRICAO}</span>
                                                    </td>
                                                    <td className="px-6 py-2">
                                                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">{row.LINHA || '-'}</span>
                                                    </td>
                                                    <td className="px-6 py-2 text-right font-mono text-blue-600">{row.QTDADE}</td>
                                                    <td className="px-6 py-2 text-right font-mono text-green-700">{row.TOTAL}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
                                        <TableIcon size={64} className="mb-4" />
                                        <p className="font-medium">Aguardando importação...</p>
                                    </div>
                                )
                            )}

                            {/* CONSOLIDATED VIEW (C) */}
                            {activeTab === 'C' && (
                                consolidatedData.length > 0 ? (
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                <th className="px-2 py-2 w-24">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs">ID</span>
                                                        <input type="text" className="w-full px-1 py-0.5 text-[10px] border rounded outline-none" placeholder="Filtrar" value={filters.id} onChange={e => setFilters({...filters, id: e.target.value})} />
                                                    </div>
                                                </th>
                                                <th className="px-2 py-2 w-40">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs">Ref.</span>
                                                        <input type="text" className="w-full px-1 py-0.5 text-[10px] border rounded outline-none" placeholder="Filtrar" value={filters.ref} onChange={e => setFilters({...filters, ref: e.target.value})} />
                                                    </div>
                                                </th>
                                                {/* INTERACTIVE HEADERS */}
                                                <th 
                                                    onClick={() => handleCategoryClick('LEVE')}
                                                    className={`px-1 py-2 text-center w-[60px] text-[10px] font-bold uppercase border-l border-slate-200 cursor-pointer transition-colors select-none ${selectedCategoryFilter === 'LEVE' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                                                    title="Filtrar por LEVE"
                                                >
                                                    LEVE
                                                </th>
                                                <th 
                                                    onClick={() => handleCategoryClick('ULTRA')}
                                                    className={`px-1 py-2 text-center w-[60px] text-[10px] font-bold uppercase border-l border-slate-200 cursor-pointer transition-colors select-none ${selectedCategoryFilter === 'ULTRA' ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                                                    title="Filtrar por ULTRA"
                                                >
                                                    ULTRA
                                                </th>
                                                <th 
                                                    onClick={() => handleCategoryClick('NOBRE')}
                                                    className={`px-1 py-2 text-center w-[60px] text-[10px] font-bold uppercase border-l border-slate-200 cursor-pointer transition-colors select-none ${selectedCategoryFilter === 'NOBRE' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                                                    title="Filtrar por NOBRE"
                                                >
                                                    NOBRE
                                                </th>
                                                <th className="px-2 py-3 text-right text-slate-400 font-normal w-24 text-xs">Qtd Matriz</th>
                                                <th className="px-2 py-3 text-right text-slate-400 font-normal w-24 text-xs">Qtd Filial</th>
                                                <th className="px-4 py-3 text-right text-green-700 w-32 text-xs border-l border-slate-100">Valor TOTAL</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredConsolidated.map((item) => {
                                                const normCat = item.category.toUpperCase();
                                                return (
                                                    <tr key={item.id} className={`transition-colors ${item.isRowRed ? 'bg-red-100 hover:bg-red-200' : 'hover:bg-slate-50'}`}>
                                                        <td className="px-2 py-2 font-mono text-slate-600 text-xs">{item.id}</td>
                                                        <td className="px-2 py-2 font-bold text-slate-800 text-xs">{item.reference}</td>
                                                        
                                                        {/* LEVE */}
                                                        <td className={`px-1 py-2 text-center font-mono text-[10px] border-l border-slate-100 ${normCat === 'LEVE' ? (item.isCellRed ? 'bg-red-200 text-red-800 font-bold' : 'text-slate-700 font-medium') : 'text-slate-200'}`}>
                                                            {normCat === 'LEVE' ? item.splitString : '-'}
                                                        </td>

                                                        {/* ULTRA */}
                                                        <td className={`px-1 py-2 text-center font-mono text-[10px] border-l border-slate-100 ${normCat === 'ULTRA' ? (item.isCellRed ? 'bg-red-200 text-red-800 font-bold' : 'text-slate-700 font-medium') : 'text-slate-200'}`}>
                                                            {normCat === 'ULTRA' ? item.splitString : '-'}
                                                        </td>

                                                        {/* NOBRE */}
                                                        <td className={`px-1 py-2 text-center font-mono text-[10px] border-l border-slate-100 ${normCat === 'NOBRE' ? 'text-slate-700 font-medium' : 'text-slate-200'}`}>
                                                            {normCat === 'NOBRE' ? item.splitString : '-'}
                                                        </td>

                                                        <td className="px-2 py-2 text-right font-mono text-xs text-slate-500">
                                                            {item.qtyMatriz > 0 ? item.qtyMatriz.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '-'}
                                                        </td>
                                                        <td className="px-2 py-2 text-right font-mono text-xs text-slate-500">
                                                            {item.qtyFilial > 0 ? item.qtyFilial.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '-'}
                                                        </td>
                                                        
                                                        <td className="px-4 py-2 text-right font-mono font-bold text-green-700 text-xs border-l border-slate-100">
                                                            {item.valTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
                                        <Sigma size={64} className="mb-4" />
                                        <p className="font-medium">Sem dados consolidados ou filtro sem resultados.</p>
                                    </div>
                                )
                            )}

                            {/* AGGREGATED PRODUCT VIEW (D) */}
                            {activeTab === 'D' && (
                                filteredProductSummary.length > 0 ? (
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                <th className="px-2 py-3 text-center w-24">
                                                    <div className="flex flex-col gap-1">
                                                        <span>Cód. Nobre</span>
                                                        <input type="text" className="w-full px-1 py-0.5 text-[10px] border rounded outline-none" placeholder="ID" value={filters.id} onChange={e => setFilters({...filters, id: e.target.value})} />
                                                    </div>
                                                </th>
                                                <th className="px-4 py-3 text-left">
                                                    <div className="flex flex-col gap-1">
                                                        <span>Produto (Ref)</span>
                                                        <div className="relative w-32">
                                                            <Search size={10} className="absolute left-2 top-2 text-slate-400"/>
                                                            <input type="text" className="w-full pl-6 pr-2 py-1 text-[10px] border rounded outline-none focus:border-brand-500" placeholder="Filtrar" value={filters.ref} onChange={e => setFilters({...filters, ref: e.target.value})} />
                                                        </div>
                                                    </div>
                                                </th>
                                                
                                                {/* MATRIZ GROUP */}
                                                <th className="px-2 py-3 text-right bg-blue-50/50 border-l border-slate-200">Qtd Matriz</th>
                                                <th className="px-2 py-3 text-right bg-blue-50/50">Valor Matriz</th>
                                                
                                                {/* FILIAL GROUP */}
                                                <th className="px-2 py-3 text-right bg-purple-50/50 border-l border-slate-200">Qtd Filial</th>
                                                <th className="px-2 py-3 text-right bg-purple-50/50">Valor Filial</th>
                                                
                                                {/* TOTAL GROUP */}
                                                <th className="px-2 py-3 text-right bg-green-50/50 border-l border-slate-200">Qtd Geral</th>
                                                <th className="px-4 py-3 text-right bg-green-50/50 font-extrabold text-green-800">TOTAL R$</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredProductSummary.map((item) => (
                                                <tr key={item.reference} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-2 py-3 text-center">
                                                        <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded ${item.nobreId !== '-' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-400'}`}>
                                                            {item.nobreId}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-bold text-slate-800">{item.reference}</td>
                                                    
                                                    {/* MATRIZ */}
                                                    <td className="px-2 py-3 text-right font-mono text-xs text-blue-600 bg-blue-50/10 border-l border-slate-100">
                                                        {item.qtyMatriz.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="px-2 py-3 text-right font-mono text-xs text-blue-600 bg-blue-50/10">
                                                        {item.valMatriz.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </td>

                                                    {/* FILIAL */}
                                                    <td className="px-2 py-3 text-right font-mono text-xs text-purple-600 bg-purple-50/10 border-l border-slate-100">
                                                        {item.qtyFilial.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="px-2 py-3 text-right font-mono text-xs text-purple-600 bg-purple-50/10">
                                                        {item.valFilial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </td>

                                                    {/* TOTAL */}
                                                    <td className="px-2 py-3 text-right font-mono text-xs font-bold text-slate-700 bg-green-50/10 border-l border-slate-100">
                                                        {item.qtyTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-sm font-extrabold text-green-700 bg-green-50/10">
                                                        {item.valTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
                                        <Package size={64} className="mb-4" />
                                        <p className="font-medium">Sem dados para resumo ou filtro sem resultados.</p>
                                    </div>
                                )
                            )}
                        </>
                    )}
                </div>

                {/* Footer Summary - DYNAMIC */}
                <div className="bg-slate-50 border-t border-slate-200 p-4">
                    {(activeTab === 'C' || activeTab === 'D') ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-in slide-in-from-bottom-2">
                            <div className="bg-blue-600 text-white border border-blue-700 p-3 rounded-lg shadow-sm">
                                <p className="text-[10px] uppercase text-blue-200 font-bold">Total Geral</p>
                                <p className="text-xl font-bold">R$ {consolidatedSummary.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="bg-white border p-3 rounded-lg shadow-sm border-blue-100">
                                <p className="text-[10px] uppercase text-blue-400 font-bold">Qtd Global (CX)</p>
                                <p className="text-xl font-bold text-blue-700">{consolidatedSummary.totalQty.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                            </div>
                            <div className="bg-white border p-3 rounded-lg shadow-sm border-slate-200">
                                <p className="text-[10px] uppercase text-slate-400 font-bold">{activeTab === 'C' ? 'Itens (IDs)' : 'Produtos (Refs)'}</p>
                                <p className="text-xl font-bold text-slate-700">{activeTab === 'C' ? consolidatedSummary.count : filteredProductSummary.length}</p>
                            </div>
                            {consolidatedSummary.totalIPI > 0 && (
                                <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg shadow-sm">
                                    <p className="text-[10px] uppercase text-orange-500 font-bold flex items-center">
                                        <Calculator size={12} className="mr-1"/> IPI Acumulado
                                    </p>
                                    <p className="text-xl font-bold text-orange-700">R$ {consolidatedSummary.totalIPI.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white border p-3 rounded-lg shadow-sm">
                                <p className="text-[10px] uppercase text-slate-400 font-bold">Itens</p>
                                <p className="text-xl font-bold text-slate-700">{currentReport.length}</p>
                            </div>
                            <div className="bg-white border p-3 rounded-lg shadow-sm border-blue-100">
                                <p className="text-[10px] uppercase text-blue-400 font-bold">Qtd Total (CX)</p>
                                <p className="text-xl font-bold text-blue-700">{currentSummary.totalQty.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                            </div>
                            <div className="bg-white border p-3 rounded-lg shadow-sm border-green-100">
                                <p className="text-[10px] uppercase text-green-400 font-bold">Valor Total</p>
                                <p className="text-xl font-bold text-green-700">R$ {currentSummary.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            {currentSummary.totalIPI > 0 && (
                                <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg shadow-sm">
                                    <p className="text-[10px] uppercase text-orange-500 font-bold flex items-center">
                                        <Calculator size={12} className="mr-1"/> IPI Detectado
                                    </p>
                                    <p className="text-xl font-bold text-orange-700">R$ {currentSummary.totalIPI.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL DE CONFERÊNCIA COM BANCO (Tabela Id_Cons) */}
            {showExportModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[85vh]">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                            <div className="flex items-center justify-between w-full mr-12">
                                <div className="flex items-center">
                                    <Database size={20} className="mr-2 text-brand-600"/> 
                                    <div>
                                        <h3 className="font-bold text-slate-800">Conferência com Banco de Dados</h3>
                                        <p className="text-xs text-slate-500">Cruza os dados do arquivo importado com o cadastro do sistema.</p>
                                    </div>
                                </div>
                                {summaryA.totalIPI > 0 && (
                                    <div className="bg-orange-50 border border-orange-200 px-4 py-1.5 rounded-lg flex flex-col items-end">
                                        <span className="text-[10px] font-bold text-orange-500 uppercase flex items-center">
                                            <Calculator size={10} className="mr-1"/> IPI (Matriz)
                                        </span>
                                        <span className="text-base font-mono font-bold text-orange-700">
                                            R$ {summaryA.totalIPI.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-0 flex-1 overflow-auto bg-white">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 shadow-sm">
                                    <tr>
                                        <th className="px-4 py-3 w-32">ID Arquivo</th>
                                        <th className="px-4 py-3 text-center w-40 bg-blue-50 text-blue-800 border-x border-blue-100">ID_Cons (DB)</th>
                                        <th className="px-4 py-3">Referência</th>
                                        <th className="px-4 py-3 w-24">Linha</th>
                                        <th className="px-4 py-3 text-right w-24">Qtd Total</th>
                                        <th className="px-4 py-3 text-right w-32">Valor Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {consolidatedData.map((item, idx) => {
                                        // MATCHING LOGIC: Finds DB Product by Code (Primary) or Name (Fallback)
                                        const matchedProduct = dbProducts.find(p => 
                                            p.codigo.toString() === item.id || 
                                            p.produto.toUpperCase() === item.reference.toUpperCase()
                                        );
                                        
                                        const idCons = matchedProduct ? matchedProduct.codigo : null;
                                        
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2 font-mono text-slate-500">{item.id}</td>
                                                
                                                {/* ID_CONS COLUMN (2nd) */}
                                                <td className={`px-4 py-2 text-center font-mono font-bold border-x border-slate-100 ${idCons ? 'text-blue-700 bg-blue-50/30' : 'text-red-400 bg-red-50/30'}`}>
                                                    {idCons ? (
                                                        <div className="flex items-center justify-center">
                                                            <CheckCircle2 size={12} className="mr-1.5 text-green-500" />
                                                            {idCons}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-center" title="Produto não encontrado no banco de dados">
                                                            <AlertCircle size={12} className="mr-1.5" /> N/D
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="px-4 py-2 font-bold text-slate-700">{item.reference}</td>
                                                <td className="px-4 py-2 text-xs">{item.line || '-'}</td>
                                                <td className="px-4 py-2 text-right font-mono text-xs">{item.qtyTotal}</td>
                                                <td className="px-4 py-2 text-right font-mono text-xs text-green-700">{item.valTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                            <button onClick={() => setShowExportModal(false)} className="px-6 py-2 bg-white border border-slate-300 rounded-lg font-bold hover:bg-slate-100 text-slate-700 shadow-sm">
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LegacyImportPage;