-- Catalog edits are rare. Invalidate durable requests in the same commit,
-- including disabled teams whose pending routes must be released.
CREATE FUNCTION replan_after_team_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO dispatch_requests (team_id) SELECT id FROM teams ORDER BY id
  ON CONFLICT (team_id) DO UPDATE SET requested_version = dispatch_requests.requested_version + 1, requested_at = clock_timestamp();
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER teams_request_replanning AFTER INSERT OR UPDATE OF name, base_lat, base_lng, road_name, km_start, km_end, capacity_per_day, active
ON teams FOR EACH STATEMENT EXECUTE FUNCTION replan_after_team_configuration();
--> statement-breakpoint
CREATE TRIGGER roads_request_replanning AFTER UPDATE OF road_name, km_start, km_end, geometry
ON road_segments FOR EACH STATEMENT EXECUTE FUNCTION replan_after_team_configuration();
