# Soru: bu sayfanın arayüz ve tasarım eleştirisi

## Bağlam

GenLayer üzerinde "Halt" adlı bir proje yaptım. GenLayer, akıllı sözleşmelerin
içinde doğrudan dil modeli çağrısı yapılabilen ve bu çağrının sonucunun
validatörler arasında konsensüse bağlandığı bir zincir. Yani bir sözleşme
"bu kanıt bu kuralı çiğniyor mu" diye sorabiliyor ve cevap tek bir sunucunun
değil, ağın kararı oluyor.

Halt şunu yapıyor: bir protokol düz metinle bir "kırmızı çizgi" yayınlıyor ve
bir ödül fonluyor. Çizginin çiğnendiğini gören herkes, kanıt ve depozito ile
alarm verebiliyor. Validatörler kanıtı okuyor ve çizgi çiğnendiyse protokol
aynı işlemde para çıkışını durduruyor. Yanlış alarm depozitoyu kaybettiriyor.
Haksız durdurulan protokol itiraz edebiliyor.

Bu proje bir hackathon'a girecek (Agent Tank, tüm GLP puanlarının %5'i buna
ayrılmış, son tarih 17 Eylül 2026) ve ayrıca GenLayer portalına proje olarak
verilecek. Jüri teknik, ve sayfaya muhtemelen iki dakikadan az bakacak.

Sayfa: tek bir statik `index.html`. Derleme adımı yok, framework yok, build
yok. Yanındaki `data.json` dosyası zincirden `export.mjs` ile çekiliyor, sayfa
onu `fetch` ile okuyup dolduruyor. GitHub Pages'te yayınlanacak. Dış bağımlılık
istemiyorum, tek dosya kalsın istiyorum.

## Sayfanın anlatmak zorunda olduğu tek şey

Jürinin soracağı öldürücü soru şu: "Bunu neden Solidity ile yazmıyorsun? Beş
satır `require` ve bir Chainlink beslemesi aynı işi daha ucuza yapar."

Cevabımız bir demo: koda yazılamayan bir kırmızı çizgi.

> Birlikte hareket eden adresler tek bir aktördür, ve hiçbir aktör on dakika
> içinde kasanın tuttuğunun üçte birinden fazlasını çekemez, kaç ayrı adrese
> yayılırsa yayılsın.

İki adres, her biri kendi yatırdığının %40'ını çekiyor. Her biri, yazılabilecek
her adres bazlı kuralın içinde kalıyor. Kendi eşik botumuzu aynı tabloya karşı
çalıştırdık, üç kez "nothing out of line" dedi. Konsensüs turu ise defterdeki
fonlanma ve çekim zamanlamasına bakıp iki adresi tek aktör ilan etti ve
protokolü 87 saniyede durdurdu.

Sayfanın başarısı tek bir ölçüte bağlı: **jüri bu karşılaştırmayı görmeden
sayfadan ayrılırsa sayfa başarısız.**

## Sayfanın şu anki yapısı, sırasıyla

1. `h1` "The pause button nobody has to press." ve bir alt paragraf.
2. Canlı durum kutusu: yeşil/kırmızı lamba, protokol adresi, guard durumu,
   tutulan miktar, engellenen çekim sayısı. Zincirden geliyor.
3. **"A red line with no implementation"** bölümü. İçinde sırasıyla:
   - açıklama paragrafı
   - kırmızı çizginin kendisi (kutu içinde düz metin)
   - monospace bir defter dökümü: iki pozisyon ve dört hareket, saat damgalı
   - iki sütunlu karşılaştırma: solda "What the threshold watcher saw"
     (hiçbir şey), sağda "What the validators saw" (validatörlerin gerekçesi
     ve 87 saniye)
   - reddedilen ilk alarmın kaydı ve neden kayıtta tutulduğu
4. "Measured, not asserted": dört sayı kartı (10/10 yanlış alarm reddedildi,
   69s medyan, 57s en hızlı, bu dağıtımdaki alarm sayısı) ve altında bir köken
   notu, çünkü ilk üç sayı sözleşmenin daha eski bir dağıtımında ölçüldü.
5. "Every alarm ever raised against it": zincirdeki her alarm, sonucu,
   validatör gerekçesi, kanıt metni, itiraz varsa itirazın gerekçesi.
6. "The red line it is being judged against": ana protokolün çizgisi.
7. "What a protocol has to add": dört satırlık Python kodu ve iki tasarım notu
   (neden açık devre başarısız oluyor, neden herkes kaldırabiliyor ama sadece
   sahibi indirebiliyor).
8. "What it will not do": iki dürüstlük notu.
9. Alt bilgi: zincir gezgini bağlantısı ve dışa aktarma zaman damgası.

## Şu anki görsel dil

Koyu tema. Renk değişkenleri:

    --bg #0a0c0f   --panel #12161b   --line #1f2630   --raised #1a1013
    --text #e6edf3 --dim #8b949e     --faint #6e7681
    --stop #f85149 --go #3fb950      --hold #d29922

Gövde sistem yazı tipi, 16px/1.6. Başlık `clamp(30px, 5.5vw, 46px)`. `h2`'ler
15px, büyük harf, `letter-spacing: .12em`, soluk gri, yani bölüm başlıkları
bilinçli olarak sessiz. Sayılar ve adresler monospace. İçerik genişliği 960px,
paragraflar 68ch ile sınırlı. Kartlar 10-12px köşe yarıçapı, 1px kenarlık.
Alarm etiketleri yuvarlak rozet: UPHELD kırmızı, REFUSED yeşil.

## Senden istediğim

Profesyonel bir arayüz eleştirisi istiyorum, nazik değil doğru olsun. Şunları
tek tek, gerekçeli ve uygulanabilir şekilde yaz:

1. **Bilgi hiyerarşisi.** Yukarıdaki sıralama doğru mu? Koordinasyon demosu
   şu an ikinci sırada, canlı kutunun hemen altında. Daha da yukarı, hatta
   `h1`'in içine mi girmeli? Hangi bölümler aşağı inmeli veya tamamen atılmalı?

2. **İki dakikalık okuyucu.** Sayfaya iki dakika bakan bir jüri üyesinin
   alması gereken üç cümle ne olmalı ve sayfa şu haliyle o üç cümleyi veriyor
   mu? Vermiyorsa ne değişmeli?

3. **Karşılaştırmanın görselleştirilmesi.** "Eşik gördü mü / tur gördü mü"
   karşıtlığı şu an iki yan yana metin kutusu. Bunu bir okuyucunun bir bakışta
   anlaması için nasıl kurardın? Somut öner: düzen, tipografi, renk, ikon,
   varsa küçük bir diyagram. Kod yazabilirsin.

4. **Defter dökümü.** Zamanlamanın kendisi kanıt, çünkü "aynı anda fonlandı,
   aynı ritimde çekti" argümanı oradan geliyor. Şu an düz monospace bir blok.
   Zamanlamayı görsel olarak nasıl gösterirdin? Zaman ekseni, iki satırlık bir
   şerit, hizalanmış işaretler gibi bir şey mantıklı mı, yoksa gereksiz süs mü?

5. **Sayı kartları.** Dört kart var ve biri diğer üçünden farklı bir dağıtımda
   ölçüldü, altında küçük bir köken notu var. Bu dürüstlük notu görsel olarak
   nasıl sunulmalı ki hem görünsün hem sayıları zayıflatmasın?

6. **Tipografi ve boşluk.** Somut değerler ver: başlık ölçekleri, satır
   yükseklikleri, bölüm arası boşluklar, ölçü genişlikleri. Şu anki değerlerin
   nesi yanlış?

7. **Renk.** Koyu tema doğru seçim mi? Kırmızı sadece "durduruldu" için mi
   kullanılmalı? Şu an REFUSED yeşil, UPHELD kırmızı, yani "alarm kabul edildi"
   kırmızı görünüyor. Bu kafa karıştırıcı mı?

8. **Hareket.** Sayfada hiç animasyon yok. Bir hackathon sayfasında lambanın
   nabız atması, sayıların sayması gibi şeyler değer katar mı yoksa ucuzlatır
   mı? Katıyorsa hangisi, katmıyorsa neden.

9. **Mobil.** Tek bir `@media (max-width: 720px)` kuralı var, o da iki sütunu
   tek sütuna indiriyor. Başka ne kırılır?

10. **Eksik bölümler.** Sayfada olmayıp olması gereken ne var? Mimari şeması,
    "nasıl entegre edilir" adımları, sık sorulanlar, tehdit modeli, bir video
    yerine geçecek adım adım anlatım gibi. Her biri için gerekli mi değil mi
    söyle.

11. **Ne atılmalı.** Fazlalık olduğunu düşündüğün her şeyi söyle. Sayfanın
    kısalması bence kazanç.

Yanıtta somut CSS ve HTML parçaları vermekten çekinme, tek dosya kısıtını koru.
Genel tavsiye değil, bu sayfaya özel karar istiyorum.
