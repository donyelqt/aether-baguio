/**
 * Central Baguio world data.
 *
 * Landmark coordinates come from OpenStreetMap via Nominatim (retrieved
 * 2026-10-06) and are projected into a local metre frame at load time by
 * `project.ts`. Road vertices are hand-authored polylines: they trace the real
 * street layout through the CBD so the network reads as Baguio, but their
 * intermediate points are interpolated and are not survey data.
 *
 * GIS ingestion is deferred (PRD §13). Phase 1 replaces the road skeleton with
 * a real extract without changing any consumer.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface LandmarkSpec {
  id: string;
  name: string;
  kind: 'park' | 'civic' | 'religious' | 'commercial' | 'nature';
  at: LatLon;
  /** Footprint half-extents in metres (x, z). */
  halfWidth: number;
  halfDepth: number;
  /** Height in metres. Ignored for parks and terrain features. */
  height: number;
}

export interface RoadSpec {
  id: string;
  roadClass: 'arterial' | 'collector' | 'local';
  /** Ordered node coordinates; a polyline through these. */
  path: LatLon[];
}

/**
 * Landmarks. Sizes are indicative of the real structures at this zoom, not
 * measured footprints.
 */
export const LANDMARKS: LandmarkSpec[] = [
  {
    id: 'burnham-park',
    name: 'Burnham Park',
    kind: 'park',
    at: { lat: 16.4080101, lon: 120.5959849 },
    // Real extent is roughly 656 m x 393 m. An earlier 360 x 300 m figure
    // swallowed the Athletic Bowl footprint entirely, putting a stadium
    // inside a lawn.
    halfWidth: 328,
    halfDepth: 196,
    height: 0,
  },
  {
    id: 'baguio-city-hall',
    name: 'Baguio City Hall',
    kind: 'civic',
    at: { lat: 16.4138341, lon: 120.5914077 },
    halfWidth: 45,
    halfDepth: 35,
    height: 18,
  },
  {
    id: 'baguio-cathedral',
    name: 'Baguio Cathedral',
    kind: 'religious',
    at: { lat: 16.412727, lon: 120.5985306 },
    halfWidth: 22,
    halfDepth: 22,
    height: 14,
  },
  {
    id: 'athletic-bowl',
    name: 'Baguio Athletic Bowl',
    kind: 'civic',
    at: { lat: 16.4075088, lon: 120.5959532 },
    halfWidth: 70,
    halfDepth: 55,
    height: 12,
  },
  {
    id: 'sm-city-baguio',
    name: 'SM City Baguio',
    kind: 'commercial',
    at: { lat: 16.408943, lon: 120.599174 },
    // Real mall block is about 110 m x 90 m. Growing it to escape the
    // clearance rule makes the problem worse, not better.
    halfWidth: 55,
    halfDepth: 45,
    height: 24,
  },
  {
    id: 'university-of-baguio',
    name: 'University of Baguio',
    kind: 'civic',
    at: { lat: 16.4155048, lon: 120.5975521 },
    halfWidth: 48,
    halfDepth: 40,
    height: 16,
  },
  {
    // The commercial street corridor itself, not a building. Modelled as a
    // low flat slab so it reads as the dense retail strip lining Session Road
    // rather than a block sitting in the carriageway — which is what a box on
    // this centre line produced.
    id: 'session-road',
    name: 'Session Road',
    kind: 'commercial',
    at: { lat: 16.4125044, lon: 120.5975059 },
    halfWidth: 120,
    halfDepth: 14,
    height: 0,
  },
  {
    // Distinct institution from University of Baguio: this one fronts Governor
    // Pack Road in the middle of the CBD.
    id: 'university-of-the-cordilleras',
    name: 'University of the Cordilleras',
    kind: 'civic',
    // Nominatim places UC on Governor Pack Road. The road network here runs
    // Magsaysay just east of that point, so the campus is anchored west of it
    // to keep the two from overlapping.
    at: { lat: 16.4084547, lon: 120.5969 },
    halfWidth: 38,
    halfDepth: 32,
    height: 20,
  },
  {
    id: 'convention-center',
    name: 'Baguio Convention Center',
    kind: 'civic',
    at: { lat: 16.4044091, lon: 120.6001159 },
    halfWidth: 50,
    halfDepth: 42,
    height: 15,
  },
  {
    id: 'camp-john-hay',
    name: 'Camp John Hay',
    kind: 'nature',
    at: { lat: 16.3994067, lon: 120.6156993 },
    halfWidth: 160,
    halfDepth: 130,
    height: 0,
  },
  {
    id: 'mines-view-park',
    name: 'Mines View Park',
    kind: 'nature',
    at: { lat: 16.4197006, lon: 120.6274987 },
    halfWidth: 120,
    halfDepth: 100,
    height: 0,
  },
];

/**
 * Road skeleton. Polylines trace the real street layout through the CBD so the
 * network reads as Baguio rather than as a grid.
 */
export const ROADS: RoadSpec[] = [
  {
    // Session Road: the central east-west spine of the CBD.
    id: 'session-road-w',
    roadClass: 'arterial',
    path: [
      { lat: 16.4125044, lon: 120.5975059 },
      { lat: 16.4129, lon: 120.5938 },
      { lat: 16.4136, lon: 120.5914 },
      { lat: 16.4143, lon: 120.5889 },
    ],
  },
  {
    id: 'session-road-e',
    roadClass: 'arterial',
    path: [
      { lat: 16.4125044, lon: 120.5975059 },
      { lat: 16.4118, lon: 120.6021 },
      { lat: 16.4109, lon: 120.6068 },
    ],
  },
  {
    // Magsaysay Drive meets Arnaiz Avenue at the south-west corner of Burnham.
    id: 'magsaysay-spur',
    roadClass: 'local',
    path: [
      { lat: 16.4048, lon: 120.5981 },
      { lat: 16.4043, lon: 120.5991 },
    ],
  },
  {
    // Magsaysay meets Arnaiz at the Burnham south edge.
    id: 'arnaiz-spur',
    roadClass: 'local',
    path: [
      { lat: 16.4043, lon: 120.5991 },
      { lat: 16.4049, lon: 120.5956 },
    ],
  },
  {
    // Harrison Road meets Magsaysay beside the Athletic Bowl.
    id: 'harrison-spur',
    roadClass: 'local',
    path: [
      { lat: 16.4080101, lon: 120.5959532 },
      // Joins Magsaysay where it now runs, west of the SM City block.
      { lat: 16.4080101, lon: 120.5982 },
    ],
  },
  {
    id: 'commodore-spur',
    roadClass: 'local',
    path: [
      { lat: 16.4044, lon: 120.6029 },
      { lat: 16.4044, lon: 120.6001 },
      { lat: 16.4049, lon: 120.5956 },
    ],
  },
  {
    // Governor Pack Road, running north from Session toward the Cathedral.
    id: 'governor-pack',
    roadClass: 'collector',
    path: [
      { lat: 16.4125044, lon: 120.5975059 },
      // Passes beside the Cathedral rather than through it. Terminating on the
      // landmark's own coordinate put an 11 m carriageway inside a 44 m footprint.
      { lat: 16.41225, lon: 120.59915 },
      { lat: 16.41165, lon: 120.59955 },
      { lat: 16.4107, lon: 120.5981 },
      { lat: 16.4146, lon: 120.5991 },
      { lat: 16.4168, lon: 120.5998 },
    ],
  },
  {
    // Access spur into the University of the Cordilleras campus, which fronts
    // Governor Pack Road in the middle of the CBD.
    id: 'uc-access-rd',
    roadClass: 'local',
    path: [
      { lat: 16.4107, lon: 120.5981 },
      { lat: 16.4084547, lon: 120.5979282 },
    ],
  },
  {
    // Burnham Park's north drive, linking the Governor Pack side to the
    // Harrison Road side. Without it the graph splits into two islands and
    // no agent can route from the cathedral district to Camp John Hay.
    id: 'burnham-north-dr',
    roadClass: 'local',
    path: [
      { lat: 16.4118, lon: 120.6021 },
      { lat: 16.4109, lon: 120.5996 },
      { lat: 16.4092, lon: 120.5984 },
      { lat: 16.4075, lon: 120.5952 },
    ],
  },
  {
    // Magsaysay Drive along the east side of Burnham Park.
    id: 'magsaysay-dr',
    roadClass: 'collector',
    path: [
      { lat: 16.4118, lon: 120.6021 },
      { lat: 16.4112, lon: 120.5996 },
      // Runs west of Burnham's east edge. At lon 120.5993 it passed 62 m from
      // SM City Baguio's centre, cutting through the mall footprint.
      { lat: 16.4080101, lon: 120.5982 },
      { lat: 16.4048, lon: 120.5981 },
      { lat: 16.4024, lon: 120.5996 },
    ],
  },
  {
    // Arnaiz Avenue, the southern edge of Burnham.
    id: 'arnaiz-ave',
    roadClass: 'collector',
    path: [
      { lat: 16.4038, lon: 120.5957 },
      { lat: 16.4049, lon: 120.5956 },
      { lat: 16.4043, lon: 120.5991 },
      { lat: 16.4044, lon: 120.6029 },
    ],
  },
  {
    // Harrison Road past the Athletic Bowl.
    id: 'harrison-rd',
    roadClass: 'collector',
    path: [
      // Stops north of the Athletic Bowl rather than on its centre point: a
      // carriageway terminating inside the stadium footprint is what put three
      // roads through one building.
      { lat: 16.4093, lon: 120.5892 },
      { lat: 16.4084, lon: 120.5925 },
      { lat: 16.4076, lon: 120.5943 },
      // Rejoin the spur north of the Bowl, keeping the graph one component.
      { lat: 16.4080101, lon: 120.5959532 },
    ],
  },
  {
    // N. Commodore Road toward Camp John Hay.
    id: 'commodore-rd',
    roadClass: 'collector',
    path: [
      { lat: 16.4044, lon: 120.6029 },
      { lat: 16.4021, lon: 120.6088 },
      { lat: 16.3994067, lon: 120.6156993 },
    ],
  },
  {
    // Camp John Way climbing to Mines View Park. The park is a hilltop lookout
    // roughly 2.4 km from the nearest other road, so without this spur it is
    // unreachable by any agent in Phase 1.
    id: 'mines-view-rd',
    roadClass: 'collector',
    path: [
      { lat: 16.3994067, lon: 120.6156993 },
      { lat: 16.4042, lon: 120.6186 },
      { lat: 16.4091, lon: 120.6221 },
      { lat: 16.4142, lon: 120.6249 },
      { lat: 16.4197006, lon: 120.6274987 },
    ],
  },
  {
    // Loctegovernor Pack north spur to the University.
    id: 'university-spur',
    roadClass: 'local',
    path: [
      { lat: 16.4146, lon: 120.5991 },
      { lat: 16.4155048, lon: 120.5975521 },
      { lat: 16.4163, lon: 120.5961 },
    ],
  },
  {
    // Kis Road linking the Cathedral to the Athletic Bowl.
    id: 'kis-rd',
    roadClass: 'local',
    path: [
      // Meets Governor Pack where it passes the Cathedral, then runs south-west.
      { lat: 16.41165, lon: 120.59955 },
      { lat: 16.4103, lon: 120.5972 },
      { lat: 16.4089, lon: 120.5966 },
    ],
  },
  {
    // Assumption Road, a short local connector in the eastern CBD.
    id: 'assumption-rd',
    roadClass: 'local',
    path: [
      { lat: 16.4118, lon: 120.6021 },
      { lat: 16.4102, lon: 120.6038 },
      // Stops at SM City Baguio's north-west corner. Terminating on the
      // landmark's own coordinate ran an 8 m road through a 110 m footprint.
      { lat: 16.40965, lon: 120.60085 },
    ],
  },
  {
    // Legazpi Street, anchored on the Session Road node it shares, so it
    // joins the main network instead of forming a disconnected island.
    id: 'legazpi-st',
    roadClass: 'local',
    path: [
      { lat: 16.4136, lon: 120.5914 },
      // Passes south of City Hall. Its own coordinate is a junction with Session
      // Road, which put the junction in the middle of the building.
      { lat: 16.41335, lon: 120.59075 },
      { lat: 16.4126, lon: 120.5908 },
      { lat: 16.4115, lon: 120.5905 },
    ],
  },
  {
    // ML Quezon Street through the university district.
    id: 'ml-quezon-st',
    roadClass: 'local',
    path: [
      { lat: 16.4155048, lon: 120.5975521 },
      { lat: 16.4139, lon: 120.5969 },
      { lat: 16.4123, lon: 120.5964 },
    ],
  },
];

/** Reference origin: Burnham Park. All local coordinates are relative to this. */
export const ORIGIN: LatLon = { lat: 16.4080101, lon: 120.5959849 };
