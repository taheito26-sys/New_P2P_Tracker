import { useState, useEffect } from 'react';
import { trading } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { Batch } from '@/types/domain';
import { useT } from '@/lib/i18n';

export default function PortfolioPage() {
  const t = useT();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { batches: b } = await trading.getBatches();
        setBatches(b);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group by asset
  const byAsset = batches.reduce((acc, b) => {
    if (!acc[b.asset_symbol]) acc[b.asset_symbol] = [];
    acc[b.asset_symbol].push(b);
    return acc;
  }, {} as Record<string, Batch[]>);

  return (
    <div className="app-page-shell" dir={t.isRTL ? 'rtl' : 'ltr'}>
      <div className="app-page-content space-y-6">
        <PageHeader title="Portfolio" description="Asset batches and positions" />
        <div className="space-y-6">
        {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>}
        {!loading && batches.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No batches in your portfolio</p>
          </div>
        )}
        {Object.entries(byAsset).map(([symbol, assetBatches]) => {
          const totalQty = assetBatches.reduce((s, b) => s + b.quantity, 0);
          const totalRemaining = assetBatches.reduce((s, b) => s + (b.remaining_qty || b.quantity), 0);
          const avgCost = totalQty > 0 ? assetBatches.reduce((s, b) => s + b.unit_cost * b.quantity, 0) / totalQty : 0;

          return (
            <Card key={symbol} className="glass">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="font-display">{symbol}</span>
                  <Badge variant="outline" className="font-mono">{totalRemaining.toFixed(4)} remaining</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Qty</p>
                    <p className="font-display font-bold">{totalQty.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Cost</p>
                    <p className="font-display font-bold">${avgCost.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Batches</p>
                    <p className="font-display font-bold">{assetBatches.length}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  {assetBatches.map(b => (
                    <div key={b.id} className="flex flex-col gap-1 border-b border-border/50 py-1.5 text-sm sm:flex-row sm:items-center sm:justify-between last:border-0">
                      <div>
                        <span className="font-mono text-xs text-muted-foreground">{new Date(b.acquired_at).toLocaleDateString()}</span>
                        <span className="ml-2">{b.quantity.toFixed(4)} @ ${b.unit_cost.toFixed(4)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {(b.remaining_qty ?? b.quantity).toFixed(4)} left
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
        </div>
      </div>
    </div>
  );
}
