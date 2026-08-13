export { PhotoMapWidget } from './components/PhotoMapWidget'
export { RegionMap } from './components/RegionMap'
export type { RegionMapReveal } from './components/RegionMap'
export { RegionPhotoDialog } from './components/RegionPhotoDialog'
export { RegionScratchDialog } from './components/RegionScratchDialog'
export { TravelWidget } from './components/TravelWidget'
export { allRegionBadges, badgeSize, nearestBadge, regionBadgeProgress } from './badges'
export type { BadgeTier, RegionBadgeProgress } from './badges'
export { countKnownVisits, districtsOf, DISTRICT_COUNT } from './districtIndex'
export { useTravelVisits, useToggleTravelVisit, travelVisitsQueryKey } from './hooks/useTravelVisits'
export { useTravelMapPhoto, travelMapPhotoQueryKey } from './hooks/useTravelMapPhoto'
export {
  useRegionPhotos,
  useRemoveRegionPhoto,
  useSetRegionPhoto,
  travelRegionPhotosQueryKey,
} from './hooks/useRegionPhotos'
export { TRAVEL_DISTRICTS } from './districts'
export type { TravelDistrict } from './districts'
export { TRAVEL_REGIONS, TRAVEL_INSETS, MAP_WIDTH, MAP_HEIGHT } from './regions'
export type { TravelRegion, TravelInset } from './regions'
export type { TravelVisit } from './api/visits'
export { RegionBadge } from './components/RegionBadge'
export { mainlandBounds } from './mainlandBounds'
