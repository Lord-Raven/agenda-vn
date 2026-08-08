import { v4 as generateUuid } from 'uuid';

// A map is a collection of links to other Maps or Locations.
export class Map {
    id: string = generateUuid();
    active: boolean = true; // Soft-delete flag. Inactive maps are hidden from management UIs.
    priority: number = 0; // A priority for ordering maps in the UI. Lower numbers are higher priority. This is also used to determine which Map shows by default; the lowest number displays when the game starts; a lower number will display if two maps have the same Location when leaving a skit. Maps cannot share a priority number.
    name: string = '';
    description: string = '';
    category: string = ''; // A category for filtering or organization in the UI. Could be a region, perhaps ("northlands", "ocean"); it is for organizational and not gameplay purposes.
    imagePrompt: string = ''; // A prompt for generating a map image 
    imageUrl: string = ''; // URL for the map image
    links: MapLink[] = []; // Links to other maps or locations

    constructor(data?: Partial<Map>) {
        Object.assign(this, data || {});
        this.links = (data?.links || []).map((link) => ({
            ...link,
            parentId: data?.id || this.id,
            coordinates: { ...link.coordinates },
        }));
    }
}

export interface MapLink {
    parentId: string; // The ID of the parent Map
    childId: string; // The ID of the child map or location
    coordinates: { x: number; y: number }; // Coordinates for the link on the parent Map (x and y are between 0 and 1, representing a percentage of the map's width and height)
}