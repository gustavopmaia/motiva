ALTER TABLE work_orders ADD CONSTRAINT work_orders_status_check CHECK (status IN ('open', 'in_progress', 'completed')),
  ADD CONSTRAINT work_orders_score_check CHECK (score_at_creation BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE readings ADD CONSTRAINT readings_source_check CHECK (source IN ('iot', 'vehicle', 'satellite')),
  ADD CONSTRAINT readings_score_check CHECK (score BETWEEN 0 AND 100),
  ADD CONSTRAINT readings_confidence_check CHECK (confidence BETWEEN 0 AND 1),
  ADD CONSTRAINT readings_coordinates_check CHECK (lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180);
--> statement-breakpoint
ALTER TABLE road_segments ADD CONSTRAINT road_segments_score_check CHECK (score_current BETWEEN 0 AND 100),
  ADD CONSTRAINT road_segments_km_check CHECK (km_start <= km_end),
  ADD CONSTRAINT road_segments_risk_version_check CHECK (risk_version >= 0);
--> statement-breakpoint
ALTER TABLE teams ADD CONSTRAINT teams_capacity_check CHECK (capacity_per_day >= 0);
--> statement-breakpoint
ALTER TABLE alerts ADD CONSTRAINT alerts_level_check CHECK (level IN ('attention', 'urgent', 'critical')),
  ADD CONSTRAINT alerts_score_check CHECK (score BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE vehicle_captures ADD CONSTRAINT vehicle_captures_confidence_check CHECK (confidence BETWEEN 0 AND 1),
  ADD CONSTRAINT vehicle_captures_classification_check CHECK (classification IN ('ok', 'attention', 'urgent'));
--> statement-breakpoint
ALTER TABLE dispatch_requests ADD CONSTRAINT dispatch_requests_versions_check CHECK (completed_version >= 0 AND requested_version >= completed_version);
