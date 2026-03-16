import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

export default function MessagesPage() {
  return (
    <div>
      <PageHeader title="Messages" description="Messages across all relationships" />
      <div className="p-6">
        <Card className="glass">
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Select a relationship to view messages</p>
            <p className="text-xs mt-1">Messages are organized by relationship workspace.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
