import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatusPanelProps = {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

export function StatusPanel({
  title,
  message,
  actionHref,
  actionLabel,
}: StatusPanelProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="font-heading text-2xl uppercase">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{message}</p>
        {actionHref && actionLabel && (
          <Button variant="outline" render={<Link href={actionHref} />}>
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
