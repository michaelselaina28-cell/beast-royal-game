import type { AnimalId } from "@game/types";
import { ANIMALS } from "@game/animals";
import { useId, useState } from "react";

const PHOTOS: Partial<Record<AnimalId, { src: string; credit: string }>> = {
  elephant: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/37/African_Bush_Elephant.jpg/330px-African_Bush_Elephant.jpg",
    credit: "African Bush Elephant by Muhammad Mahdi Karim, GFDL 1.2",
  },
  hippo: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Portrait_Hippopotamus_in_the_water.jpg/330px-Portrait_Hippopotamus_in_the_water.jpg",
    credit: "Hippopotamus by Muhammad Mahdi Karim, CC BY-SA 4.0",
  },
  bear: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9e/Ours_brun_parcanimalierpyrenees_1.jpg/330px-Ours_brun_parcanimalierpyrenees_1.jpg",
    credit: "Brown bear by Jean-Noel Lafargue, Free Art License",
  },
  rhino: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/ff/081_White_rhinoceros_%28male%29_in_the_Kalahari_Desert_of_Namibia_Photo_by_Giles_Laurent.jpg/330px-081_White_rhinoceros_%28male%29_in_the_Kalahari_Desert_of_Namibia_Photo_by_Giles_Laurent.jpg",
    credit: "White rhinoceros by Giles Laurent, CC BY-SA 4.0",
  },
  gorilla: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bb/Gorille_des_plaines_de_l%27ouest_%C3%A0_l%27Espace_Zoologique.jpg/330px-Gorille_des_plaines_de_l%27ouest_%C3%A0_l%27Espace_Zoologique.jpg",
    credit: "Western gorilla by Thurundir, CC BY-SA 4.0",
  },
  lion: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9e/Lion_%28Panthera_leo%29_male_6y.jpg/330px-Lion_%28Panthera_leo%29_male_6y.jpg",
    credit: "Lion photo by Charles J. Sharp, CC BY-SA 4.0",
  },
  crocodile: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bd/Nile_crocodile_head.jpg/330px-Nile_crocodile_head.jpg",
    credit: "Nile crocodile by Leigh Bedford, CC BY 2.0",
  },
  tiger: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b0/Bengal_tiger_%28Panthera_tigris_tigris%29_female_3_crop.jpg/330px-Bengal_tiger_%28Panthera_tigris_tigris%29_female_3_crop.jpg",
    credit: "Bengal tiger by Charles J. Sharp, CC BY-SA 4.0",
  },
  wolf: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/Eurasian_wolf_2.jpg/330px-Eurasian_wolf_2.jpg",
    credit: "Eurasian wolf by Mas3cf, CC BY-SA 4.0",
  },
  shark: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/Corl0207_%2828225976491%29.jpg/330px-Corl0207_%2828225976491%29.jpg",
    credit: "Shark photo by NOAA Photo Library, CC BY 2.0",
  },
  python: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Python_molurus_molurus_2.jpg/330px-Python_molurus_molurus_2.jpg",
    credit: "Python molurus by Tigerpython, CC BY-SA 3.0",
  },
  scorpion: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fe/Scorpion_Photograph_By_Shantanu_Kuveskar.jpg/330px-Scorpion_Photograph_By_Shantanu_Kuveskar.jpg",
    credit: "Scorpion by Shantanu Kuveskar, CC BY-SA 4.0",
  },
  octopus: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/57/Octopus2.jpg/330px-Octopus2.jpg",
    credit: "Octopus by Albert Kok, CC BY-SA 3.0",
  },
  bat: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/77/Big-eared-townsend-fledermaus.jpg/330px-Big-eared-townsend-fledermaus.jpg",
    credit: "Townsend's big-eared bat, public domain",
  },
  cheetah: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/92/Male_cheetah_facing_left_in_South_Africa.jpg/330px-Male_cheetah_facing_left_in_South_Africa.jpg",
    credit: "Cheetah by AfricanConservation, CC BY-SA 4.0",
  },
  eagle: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/Eagles_together.jpg/330px-Eagles_together.jpg",
    credit: "Eagles by Punetor i Rregullt5, CC BY-SA 4.0",
  },
  fox: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/30/Vulpes_vulpes_ssp_fulvus.jpg/330px-Vulpes_vulpes_ssp_fulvus.jpg",
    credit: "Red fox by Joanne Redwood, CC0",
  },
  cobra: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/66/Indiancobra.jpg/330px-Indiancobra.jpg",
    credit: "Indian cobra by Kamalnv, CC BY 3.0",
  },
  parrot: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ad/Rainbow_lorikeet_%28Trichoglossus_moluccanus_moluccanus%29_Sydney.jpg/330px-Rainbow_lorikeet_%28Trichoglossus_moluccanus_moluccanus%29_Sydney.jpg",
    credit: "Rainbow lorikeet by Charles J. Sharp, CC BY-SA 4.0",
  },
  bee: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/76/Tetragonula_carbonaria_%2814521993792%29.jpg/330px-Tetragonula_carbonaria_%2814521993792%29.jpg",
    credit: "Tetragonula carbonaria by Graham Wise, CC BY 2.0",
  },
};

const PATHS: Record<AnimalId, string> = {
  elephant: "M12 40c8-16 28-18 40-6-2 10-14 18-28 18-8 0-12-4-12-12zm8-18c2-8 8-12 8-12s4 8 2 14",
  hippo: "M14 36c4-14 32-14 36 2-2 10-12 16-20 16s-16-6-16-18zm8-8h4m16 0h4",
  bear: "M16 28c0-10 28-10 32 2 0 12-8 22-16 22s-16-10-16-24zm4-10l4 6m24-6l-4 6",
  rhino: "M12 38c6-12 24-16 36-8-4 12-16 20-28 18zm28-12l10-8",
  gorilla: "M20 22c8-10 24-6 24 8 0 16-8 24-16 24s-16-12-8-32zm8 8v8",
  lion: "M18 30c2-16 28-16 30 0-2 14-10 22-16 22s-14-8-14-22zm-4-4c8-10 28-10 36 2",
  crocodile: "M8 36c12-6 28-4 44 4-10 6-24 6-36 2zm8-4l6-6m8 2l6-6",
  tiger: "M14 34c6-16 30-16 36 0-4 14-12 20-18 20s-16-6-18-20zm6-2v6m12-6v8m12-8v6",
  wolf: "M12 38c8-20 32-18 40-2-10 12-24 16-36 8zm8-16l-6-10m28 10l8-10",
  shark: "M8 32c16-12 40-8 48 4-16 6-28 8-40 4zm28-4l12-10",
  python: "M10 40c8-16 16 4 24-8 8-12 16 2 22 0",
  scorpion: "M16 40c8-4 16-4 24 0m-12-4v-12l10-8m-10 8l-10-8m12 22l8 8",
  octopus: "M20 28c0-10 24-10 24 4 0 6-6 10-12 10s-12-4-12-14zm0 12c-6 8-8 12-8 12m12-8v16m12-16c6 8 8 12 8 12",
  bat: "M8 28c12 8 16 4 24 4s12 4 24-4c-8 16-16 20-24 12-8 8-16 4-24-12z",
  cheetah: "M12 38c10-16 32-14 40 2-8 10-24 12-36 6zm6-10l4 6m8-8l4 8m8-8l4 6",
  eagle: "M8 36c16-18 32-18 48 0-16-4-20-4-24-12-4 8-8 8-24 12z",
  fox: "M12 40c8-18 32-18 40 0-12 8-28 8-40 0zm8-16l-8-12m32 12l8-12",
  cobra: "M32 12c8 8 8 16 0 22 12 0 16 8 12 16-16-4-24-12-12-22-8-2-10-10 0-16z",
  parrot: "M20 20c16-12 28 4 16 16-8 8-8 16-4 24-16-8-20-20-12-40z",
  bee: "M24 32c0-10 16-10 16 0s-4 12-8 12-8-2-8-12zm-8-4c-8-8-8 8 0 4m24-4c8-8 8 8 0 4",
};

export function AnimalArt({ id, size = 72 }: { id: AnimalId; size?: number }) {
  const a = ANIMALS[id];
  const gradientId = `animal-${useId().replace(/:/g, "")}`;
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = PHOTOS[id];

  if (photo && !photoFailed) {
    return (
      <img
        className="portrait portrait-photo"
        src={photo.src}
        width={size}
        height={size}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        title={`${a.name} · ${photo.credit}`}
        style={{ borderColor: a.accent, width: size, height: size }}
        onError={() => setPhotoFailed(true)}
      />
    );
  }

  return (
    <svg className="portrait" width={size} height={size} viewBox="0 0 96 96" aria-hidden>
      <defs>
        <radialGradient id={gradientId} cx="32%" cy="24%">
          <stop offset="0%" stopColor={a.accent} stopOpacity="0.92" />
          <stop offset="72%" stopColor={a.accent} stopOpacity="0.42" />
          <stop offset="100%" stopColor="#10191a" />
        </radialGradient>
      </defs>
      <rect x="3" y="3" width="90" height="90" rx="29" fill="#10191a" stroke={a.accent} strokeOpacity="0.8" strokeWidth="2" />
      <circle cx="48" cy="48" r="38" fill={`url(#${gradientId})`} />
      <circle cx="48" cy="48" r="35" fill="none" stroke="#fff8e9" strokeOpacity="0.22" strokeDasharray="1 5" />
      <g transform="translate(16 16)">
        <path d={PATHS[id]} fill="none" stroke="#10191a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={PATHS[id]} fill="none" stroke="#fff8e9" strokeOpacity="0.88" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M20 76c8 7 16 10 28 10s20-3 28-10" fill="none" stroke={a.accent} strokeOpacity="0.65" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
