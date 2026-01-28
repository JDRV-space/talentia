"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  zone: string;
  start_date: string;
  estimated_workers: number;
  status: "planned" | "recruiting" | "active";
}

interface UpcomingCampaignsProps {
  campaigns: Campaign[];
  title?: string;
}

export function UpcomingCampaigns({
  campaigns,
  title = "Campañas Próximas",
}: UpcomingCampaignsProps) {
  if (campaigns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="size-4 text-teal-600" />
            {title}
          </CardTitle>
          <span className="text-xs text-muted-foreground">Próximos 30 días</span>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="size-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay campañas programadas en los próximos 30 días</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="size-4 text-teal-600" />
          {title}
        </CardTitle>
        <span className="text-xs text-muted-foreground">Próximos 30 días</span>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card"
            >
              <div className="space-y-1">
                <p className="font-medium text-sm">{campaign.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{campaign.zone}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {new Date(campaign.start_date).toLocaleDateString("es-PE", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="text-xs">
                  {campaign.estimated_workers} trabajadores
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
