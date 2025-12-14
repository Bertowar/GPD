
import React, { useState, useEffect } from 'react';
import { fetchAlerts, markAlertAsRead } from '../services/storage';
import { AppAlert } from '../types';
import { AlertTriangle, Clock, Activity, Ban, CheckCircle, Loader2 } from 'lucide-react';

const AlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
        const data = await fetchAlerts();
        // Sort by Date desc (redundant if DB sorts, but safe)
        data.sort((a, b) => b.createdAt - a.createdAt);
        setAlerts(data);
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    await markAlertAsRead(id);
    loadAlerts(); // Refresh UI List
    
    // Dispatch event to update Sidebar Badge without page reload
    window.dispatchEvent(new Event('alert-update'));
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'quality': return <AlertTriangle className="text-red-500" />;
      case 'productivity': return <Activity className="text-orange-500" />;
      case 'downtime': return <Ban className="text-slate-700" />;
      default: return <Clock className="text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch(severity) {
      case 'high': return 'bg-red-50 border-red-100';
      case 'medium': return 'bg-orange-50 border-orange-100';
      default: return 'bg-blue-50 border-blue-100';
    }
  };

  if (loading) {
    return (
        <div className="flex h-64 items-center justify-center text-slate-500">
            <Loader2 className="animate-spin mr-2" />
            Carregando alertas...
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Central de Alertas</h2>
        <span className="text-sm text-slate-500">{alerts.filter(a => !a.isRead).length} não lidos</span>
      </div>

      <div className="space-y-4">
        {alerts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <CheckCircle size={48} className="mx-auto text-green-400 mb-4" />
            <p className="text-slate-500 font-medium">Tudo certo! Nenhum alerta registrado.</p>
          </div>
        ) : (
          alerts.map(alert => (
            <div 
              key={alert.id} 
              className={`p-5 rounded-lg border flex items-start space-x-4 transition-all ${getSeverityColor(alert.severity)} ${alert.isRead ? 'opacity-60' : 'shadow-sm'}`}
            >
              <div className="flex-shrink-0 mt-1">
                {getIcon(alert.type)}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-slate-800">{alert.title}</h3>
                  <span className="text-xs text-slate-500">
                    {new Date(alert.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-slate-700 mt-1 text-sm">{alert.message}</p>
                
                {!alert.isRead && (
                  <button 
                    onClick={() => handleMarkAsRead(alert.id)}
                    className="mt-3 text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center"
                  >
                    <CheckCircle size={14} className="mr-1" />
                    Marcar como lido
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertsPage;
