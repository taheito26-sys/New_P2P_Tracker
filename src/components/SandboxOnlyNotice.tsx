import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SandboxOnlyNoticeProps {
  title: string;
  description: string;
}

export function SandboxOnlyNotice({ title, description }: SandboxOnlyNoticeProps) {
  return (
    <div className="min-h-[320px] flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl glass">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This view is blocked by governance policy until live or user-provided data is configured for this environment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
