# Push-Up Counter

Aplikacja webowa licząca pompki automatycznie przez kamerę telefonu —
wykrywanie pozycji ciała (MediaPipe Pose) działa w całości lokalnie w
przeglądarce, bez backendu i bez wysyłania czegokolwiek do internetu.

## Jak opublikować na GitHub Pages

1. **Stwórz nowe repozytorium na GitHubie** (Public — GitHub Pages za darmo
   wymaga publicznego repo, chyba że masz płatny plan GitHub).

2. **Wgraj całą zawartość tego folderu** do repozytorium — struktura musi
   wyglądać tak, żeby `index.html` był w głównym katalogu repo (albo w
   katalogu `docs/`, patrz krok 4):

   ```
   twoje-repo/
   ├── index.html
   ├── style.css
   ├── js/
   └── libs/
       ├── mediapipe/
       └── models/
           └── pose_landmarker_lite.task
   ```

   Możesz to zrobić przez stronę GitHuba (przeciągnij i upuść pliki) albo
   przez git:
   ```bash
   git init
   git add .
   git commit -m "Push-up counter"
   git branch -M main
   git remote add origin https://github.com/TWOJA-NAZWA/TWOJE-REPO.git
   git push -u origin main
   ```

3. **Włącz GitHub Pages**:
   - Wejdź w Settings repozytorium → Pages (w menu po lewej)
   - Source: wybierz branch `main`, folder `/ (root)`
   - Kliknij Save

4. **Poczekaj 1-2 minuty** — GitHub wygeneruje adres w formacie:
   ```
   https://TWOJA-NAZWA.github.io/TWOJE-REPO/
   ```
   Adres pojawi się w tej samej zakładce Settings → Pages, gdy build
   się skończy (zielony napis "Your site is live at...").

5. **Otwórz ten adres na telefonie** (Chrome na Androidzie lub Safari na
   iOS) i kliknij START — przeglądarka poprosi o dostęp do kamery
   standardowym systemowym oknem.

## Dlaczego to działa bez backendu

- Cała logika (kamera, wykrywanie pozy, liczenie pompek, historia,
  rekordy) działa w JavaScript bezpośrednio w przeglądarce.
- Wyniki i ustawienia zapisują się w `localStorage` przeglądarki na danym
  urządzeniu — nie ma wspólnej bazy danych między urządzeniami (to jest
  różnica względem wersji z serwerem: tu każde urządzenie/przeglądarka ma
  swoją osobną historię).
- Model AI do wykrywania pozy (`pose_landmarker_lite.task`, ok. 5.6 MB)
  jest częścią repozytorium — ładuje się raz przy starcie strony i działa
  całkowicie lokalnie, bez żadnych zapytań do zewnętrznych serwerów.

## Wymagania

- **HTTPS jest konieczny** dla dostępu do kamery — GitHub Pages zawsze
  serwuje przez HTTPS, więc nie musisz nic dodatkowo konfigurować.
- Przeglądarka mobilna z obsługą WebAssembly i `getUserMedia` — każda
  współczesna wersja Chrome/Safari/Firefox na telefonie to spełnia.

## Ograniczenia tej wersji (bez backendu)

- Brak logowania — strona jest publicznie dostępna pod tym adresem dla
  każdego, kto zna URL. Jeśli chcesz to ukryć przed innymi, jedyna opcja
  bez backendu to nieujawnianie linku (GitHub Pages nie ma wbudowanego
  hasła dostępu na darmowym planie).
- Dane (historia, rekordy) są lokalne dla przeglądarki/urządzenia — jeśli
  otworzysz stronę na innym telefonie albo wyczyścisz dane przeglądarki,
  historia zniknie. Jeśli zależy Ci na wspólnych danych między
  urządzeniami, potrzebny jest backend (masz już taką wersję z serwerem
  Node/Express z wcześniejszej rozmowy).
