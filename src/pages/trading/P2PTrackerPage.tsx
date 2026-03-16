import { useState, useEffect } from 'react';
import { p2p } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/layout/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, TrendingDown, ArrowUpDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { P2PSnapshot, P2PHistoryPoint } from '@/types/domain';

export default function P2PTrackerPage() {
  const [snapshot, setSnapshot] = useState<P2PSnapshot | null>(null);
  const [history, setHistory] = useState<P2PHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([p2p.latest(), p2p.history()]);
      setSnapshot(s);
      setHistory(Array.isArray(h) ? h : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load P2P data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const chartData = history.map(h => ({
    time: new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    sell: h.sellAvg,
    buy: h.buyAvg,
    spread: h.spread,
  }));

  return (
    <div>
      <PageHeader title="P2P Price Tracker" description="USDT/QAR live market monitor">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </PageHeader>

      <div className="p-6 space-y-6">
        {loading && !snapshot && (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        )}

        {snapshot && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Sell Avg" value={snapshot.sellAvg?.toFixed(2) || '—'} icon={TrendingDown} />
              <StatCard label="Buy Avg" value={snapshot.buyAvg?.toFixed(2) || '—'} icon={TrendingUp} />
              <StatCard label="Spread" value={snapshot.spread?.toFixed(2) || '—'} icon={ArrowUpDown} />
              <StatCard
                label="Spread %"
                value={snapshot.spreadPct ? `${snapshot.spreadPct.toFixed(3)}%` : '—'}
                icon={ArrowUpDown}
                trend={snapshot.spreadPct && snapshot.spreadPct > 0 ? 'Positive spread' : undefined}
                trendUp={!!snapshot.spreadPct && snapshot.spreadPct > 0}
              />
            </div>

            {/* Price Chart */}
            {chartData.length > 0 && (
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="text-sm font-display">Price History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="sell" stroke="hsl(0, 72%, 51%)" dot={false} strokeWidth={2} name="Sell Avg" />
                        <Line type="monotone" dataKey="buy" stroke="hsl(142, 72%, 38%)" dot={false} strokeWidth={2} name="Buy Avg" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Order Book */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="text-sm font-display flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-destructive" /> Sell Offers (You Buy)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {snapshot.sellOffers?.slice(0, 5).map((o, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                        <span className="font-mono font-bold">{o.price.toFixed(2)}</span>
                        <span className="text-xs text-muted-foreground">{o.nick}</span>
                        <span className="text-xs">{o.min.toFixed(0)}-{o.max.toFixed(0)} QAR</span>
                        <div className="flex gap-1">
                          {o.methods.slice(0, 2).map(m => (
                            <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="text-sm font-display flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-success" /> Buy Offers (You Sell)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {snapshot.buyOffers?.slice(0, 5).map((o, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                        <span className="font-mono font-bold">{o.price.toFixed(2)}</span>
                        <span className="text-xs text-muted-foreground">{o.nick}</span>
                        <span className="text-xs">{o.min.toFixed(0)}-{o.max.toFixed(0)} QAR</span>
                        <div className="flex gap-1">
                          {o.methods.slice(0, 2).map(m => (
                            <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
