import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import CountUp from 'react-countup';
import React from 'react';

interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  className?: string;
  iconClassName?: string;
}

export function SummaryCard({ title, value, icon: Icon, description, className, iconClassName }: SummaryCardProps) {
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);
  
  // Determine if the value can be animated
  // It should animate if it's a number, or a string that represents a simple number.
  // It should not animate if it's a string like "X / Y".
  const numericValueFromString = typeof value === 'string' ? parseFloat(value) : value;
  const canAnimate = typeof value === 'number' || (typeof value === 'string' && !isNaN(numericValueFromString) && /^\s*[\d.]+\s*$/.test(value));
  const endValue = typeof value === 'number' ? value : numericValueFromString;

  return (
    <Card className={cn("shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-1", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground font-body">{title}</CardTitle>
        <Icon className={cn("h-5 w-5 text-muted-foreground", iconClassName)} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold font-headline">
          {isMounted && canAnimate ? (
            <CountUp end={endValue} duration={1.5} separator="," />
          ) : (
            value // Display original string or number if not animating or not mounted
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground pt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
