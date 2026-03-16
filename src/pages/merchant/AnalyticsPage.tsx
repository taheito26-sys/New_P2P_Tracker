import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/layout/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, Users, AlertTriangle, Loader2 } from 'lucide-react';
import { analytics } from '@/lib/api';
import { toast } from 'sonner';

export default function AnalyticsPage() {
  const [data, setData] = useState({
    totalDeployed: 0,
    realizedProfit: 0,
    overdueExposure: 0,
    activeRelationships: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analytics.get().then(res => {
      setData(res);
      setLoading(false);
    }).catch(err => {
      toast.error(err.message || "Failed to load analytics");
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <PageHeader title="Analytics" description="Portfolio-wide performance metrics" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Deployed" value={loading ? "..." : `$${data.totalDeployed.toLocaleString()}`} icon={DollarSign} />
          <StatCard label="Realized Profit" value={loading ? "..." : `$${data.realizedProfit.toLocaleString()}`} icon={TrendingUp} />
          <StatCard label="Active Relationships" value={loading ? "..." : data.activeRelationships} icon={Users} />
          <StatCard label="Overdue Items" value={loading ? "..." : `$${data.overdueExposure.toLocaleString()}`} icon={AlertTriangle} />
        </div>
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-sm font-display">Performance Over Time</CardTitle>
          </CardHeader>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Charts will populate as deal data accumulates.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
