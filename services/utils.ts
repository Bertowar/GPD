
// Helper to format errors safely (ROBUST VERSION)
export const formatError = (e: any): string => {
    try {
        if (e === null || e === undefined) return "Erro desconhecido";
        
        // Primitive types
        if (typeof e === 'string') return e;
        if (typeof e === 'number') return e.toString();
        
        // Error instance
        if (e instanceof Error) return e.message;
        
        // Common objects (Supabase, Auth0, APIs)
        if (typeof e === 'object') {
             // Supabase / Postgrest Error (standard structure)
             if (e.message && typeof e.message === 'string') return e.message;
             if (e.error_description && typeof e.error_description === 'string') return e.error_description;
             
             // Nested error object (sometimes Supabase returns { error: { message: ... } })
             if (e.error) {
                 if (typeof e.error === 'string') return e.error;
                 if (typeof e.error === 'object' && e.error.message) {
                     return typeof e.error.message === 'string' ? e.error.message : JSON.stringify(e.error.message);
                 }
             }

             if (e.details && typeof e.details === 'string') return e.details;
             
             // Fallback: Try to stringify the whole object
             try {
                 const json = JSON.stringify(e);
                 if (json === '{}' || json === '[]') {
                    // Se for um objeto vazio, tenta pegar o nome do construtor ou retorna mensagem genérica
                    return (e && e.constructor && e.constructor.name !== 'Object') 
                        ? `${e.constructor.name}: ${e.toString()}` 
                        : "Erro desconhecido (Detalhes não disponíveis)";
                 }
                 return json;
             } catch (jsonErr) {
                 return "Erro complexo (Objeto não serializável)";
             }
        }

        return String(e); // Fallback for symbols, functions etc
    } catch (err) {
        return "Erro desconhecido (Falha ao formatar)";
    }
};
