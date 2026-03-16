import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/layout/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, Users, AlertTriangle } from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader title="Analytics" description="Portfolio-wide performance metrics" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Deployed" value="$0" icon={DollarSign} />
          <StatCard label="Realized Profit" value="$0" icon={TrendingUp} />
          <StatCard label="Active Relationships" value="0" icon={Users} />
          <StatCard label="Overdue Items" value="0" icon={AlertTriangle} />
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
