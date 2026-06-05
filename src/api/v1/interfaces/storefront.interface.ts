export interface IBanner {
  title: string;
  desktopImage: { url: string; publicId: string };
  mobileImage: { url: string; publicId: string };
  link?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface IVideo {
  title: string;
  video: { url: string; publicId: string };
  isActive: boolean;
  sortOrder: number;
}

export interface IPopup {
  title: string;
  image: { url: string; publicId: string };
  link?: string;
  isActive: boolean;
}
