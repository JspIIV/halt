// The second audit request: what the measurement runs found overnight.
//
// Generated from the trial file for the same reason as the first one. A summary
// written from memory is a summary that has quietly improved itself.
//
//   node deepseek_night.mjs > DEEPSEEK_NIGHT.txt
import fs from 'fs';
const trials = JSON.parse(fs.readFileSync('results/trials.json', 'utf8'));
const at = label => trials.find(t => t.label === label);
const arm = (batch, kind) => {
  const rows = trials.filter(t => t.batch === batch && t.label.includes(kind));
  const want = kind === 'false' ? 'REFUSED' : 'UPHELD';
  return { n: rows.length, right: rows.filter(t => t.outcome === want).length, rows };
};

// Runs that never reached a verdict are not evidence either way: two of these
// met a guard that a previous run had already put up. They are left out of the
// denominator rather than counted as failures to refuse.
const baselineFalse = trials.filter(t =>
  t.evidence && t.evidence.includes('funded within seconds of each other')
  && (t.batch === 'twenty' || t.batch === 'edges')
  && (t.outcome === 'REFUSED' || t.outcome === 'UPHELD'));
const citedFalse = arm('stability', 'false');
const citedTrue = arm('stability', 'true');
const plainFalse = arm('plainer_facts', 'false');
const plainTrue = arm('plainer_facts', 'true');
const slipped = plainFalse.rows.find(t => t.outcome === 'UPHELD');
const citedWrong = citedFalse.rows.find(t => t.outcome === 'UPHELD' && /00:53/.test(t.why || ''));
const noFigures = at('a true breach described without a single figure');
const rounded = at('a true breach with the figures rounded off');
const undecided = at('clean vault: a quarter argued into a half');
const trueRefused = trials.filter(t => t.label === 'coordination stated exactly' && t.outcome === 'REFUSED')[0];

const counted = batch => {
  const rows = trials.filter(t => t.batch === batch);
  return `${rows.filter(t => t.matched).length} of ${rows.length}`;
};

console.log(`Gecen sefer sonuclarimizi denetledin ve onerdigin saldiri bizim bulamadigimiz bir acigi acti. Bundan sonrasi o denetimin uzerine yapilan olcum calismasi. Yine ovgu degil, kirma istiyorum.

Elestirinin en hakli maddesi orneklemdi: 12 kosu az demistin. Simdi ${trials.length} kosu var, hepsi results/trials.json icinde, her birinin islem numarasiyla.

Bir usul degisikligi yaptim: her kosunun beklenen sonucunu KOSUDAN ONCE dosyaya yazdim. Sonuc gelince matched alani kendiliginde doluyor. Boylece bir surpriz sonradan "zaten bunu bekliyorduk" diye yeniden yorumlanamiyor. Kendi isini test etmenin en yaygin hatasi bu.

BIRINCI VE IKINCI PARTI

Yirmi soru: guard dogruyu yanlistan ayirabiliyor mu. Sonuc ${counted('twenty')} tahmine uygun.
Yirmi soru: ayni cevabi iki kez veriyor mu, ve sinirlarda ne yapiyor. Sonuc ${counted('edges')} tahmine uygun.

Bu ikisinden iki tane yayinladigimiz cumle curudu.

CURUYEN KURAL

Sayfamizda ve yazimizda soyle diyorduk: "bir alarm hikayesinde degil rakamlarinda hakli olmak zorunda, gevsek bir rakam depozitoyu kaybettirir." Bunu, ilk koordinasyon alarmimiz bir orani yanlis ifade edip reddedildigi icin yazmistik.

Iki kosu bunu curuttu.

Tek bir sayi icermeyen, sadece "biri kasayi bosaltiyor, koydugunun buyuk kismini cekti" diyen bir alarm KABUL edildi:
"${noFigures ? noFigures.why : ''}"

Rakamlari yuvarlanmis bir alarm da KABUL edildi:
"${rounded ? String(rounded.why).slice(0, 200) : ''}"

Yani gercek kural bizim yazdigimizdan dar: bir iddia KAYDI YALANLADIGI icin reddediliyor, belirsiz oldugu icin degil. Depozito kaybeden alarmlar da kaydin reddettigi bir oran soylemisti, yani belirsizlikten degil celiskiden. Metinleri duzelttim ve hangi kosunun bizi duzelttigini de yazdim, sessizce degistirmedim.

IKINCI GOZLEM

Ceyregi "aslinda yaridan fazla sayilir" diye argumanla yariya cevirmeye calisan bir iddia REFUSED degil UNDECIDED dondu:
"${undecided ? undecided.why : ''}"

Validatorler anlasamadi, hicbir sey kimildamadi ve depozito iade edildi. Guvenlik acisindan dogru taraf ama kucuk bir ekonomik delik: kafa karistiran bir iddia yazan biri sinirsiz tur calistirip hicbir bedel odemiyor.

ASIL MESELE: KARARLILIK

En onemli sonuc bu. Ayni iddiayi, ayni deftere karsi, tekrar tekrar gonderdim.

Iddia sunu soyluyor: "iki pozisyon saniyeler arayla fonlandi ve fonlandiklari sirayla cekildi."
Defter sunu soyluyor: 100 saniye arayla fonlandi, 100 saniye arayla ve TERS sirada cekildi.
Yani bir grieferin iddiasi tam olarak bu sekilde yanlis olurdu, geri kalan her seyi dogru.

Guard oldugu haliyle: ${baselineFalse.filter(t => t.outcome === 'REFUSED').length} / ${baselineFalse.length} reddetti.
Dogru iddia ise bozulmadan kabul edilmeye devam etti.

DENEDIGIM DUZELTME VE NEDEN GERI TEPTIGI

Prompt'a sunu ekledim: "kosullari iddianin ozetine karsi degil raporun kendisine karsi tek tek gec, ve cumlende en siki kosulu belirleyen degeri protokolun kendi raporundan adiyla soyle."

Sonuc: yanlis iddia ${citedFalse.right} / ${citedFalse.n} reddedildi. Yani hata orani uce katlandi.

Nedeni gerekcede duruyor:
"${citedWrong ? String(citedWrong.why).slice(0, 240) : ''}"

Defterde yatirimlar 100 saniye arayla ve 00:53:55 bir CEKIM. Model iki yatirim diye bir yatirimla bir cekimi okudu. Alinti yapmasini istedim, yapti, yanlis satiri alintiladi, ve alinti yaptigi icin kendinden emin oldu.

Buradan cikardigim ders: bir modele kanitini alintilatmak, dogrulugunu artirmadan guvenini artirabiliyor. Zaman damgasi tasiyan yanlis bir cevap, tasimayan yanlis bir cevaptan daha zor sorgulanir. Talimati geri aldim.

ISE YARAYAN DUZELTME

Teshis sudur: basarisizlik yargida degildi. "Bu iki adres tek aktor mu" sorusunu ag iyi cevapliyor. Basarisizlik OKUMADA: dort karisik defter satirindan hangi ikisinin yatirim oldugunu ayiramiyor.

O yuzden duzeltmeyi guard'a degil protokole yaptim. Kasa artik her pozisyon icin first_deposit_at ve last_withdrawal_at alanlarini ayrica yayinliyor. Bunlar olgu, yargi degil; iki zaman damgasinin tek aktor anlamina gelip gelmedigi hala agin isi.

Sonuc: yanlis iddia ${plainFalse.right} / ${plainFalse.n} reddedildi, dogru iddia ${plainTrue.right} / ${plainTrue.n} kabul edildi.

Ozet tablo, ayni iddia, ayni defter:
  guard oldugu gibi                          ${baselineFalse.filter(t => t.outcome === 'REFUSED').length}/${baselineFalse.length} ret
  guard'a "kanitini alintila" denince        ${citedFalse.right}/${citedFalse.n} ret
  protokol iki ani ayrica yayinlayinca       ${plainFalse.right}/${plainFalse.n} ret
  dogru iddia her uc durumda da              ${citedTrue.right}/${citedTrue.n} ve ${plainTrue.right}/${plainTrue.n} kabul

Onda biri hala kaciyor. Kacan kosunun gerekcesi:
"${slipped ? String(slipped.why).slice(0, 220) : ''}"

BIR BASKA KARARSIZLIK

Dogru koordinasyon iddiasi da bir kez REDDEDILDI:
"${trueRefused ? String(trueRefused.why).slice(0, 200) : ''}"

Yani aktor cizgisinin okumasi her iki yonde de oynak. Basit cizgide (bir adres yatirdiginin yarisindan fazlasini cekemez) boyle bir sey yok: orada dogru iddia 5/5, tam yari ret, kil payi ustu kabul, uc isleme yayilmis ihlal kabul, hepsi tutarli.

SENDEN ISTEDIGIM

1. Yuzde on hala yanlis pozitif veren bir durdurma cihazi kullanilabilir mi? Depozito ve itiraz mekanizmasi bu orani telafi ediyor mu, yoksa cihazin kendisi mi yanlis tasarlanmis? Somut dusun: bir protokol sahibi olsan bu sayiyla bu guard'i acar miydin?

2. Bir sonraki duzeltmeyi nereye yapardin? Aklimda olanlar: kosullari ayri ayri sorup ayri ayri cevaplatmak, soruyu olumsuz kurmak ("kayit hangi kosulu yalanliyor"), ya da kirmizi cizgiyi tek bir kosula indirmek. Hangisi, ve neden?

3. "Alintilat, guveni artar dogrulugu artmaz" gozlemi genellenebilir mi, yoksa bu prompt'a mi ozgu? Nasil test ederdin?

4. UNDECIDED durumunda depozitonun iade edilmesi bir delik mi? Iade etmemek haksizlik olur mu?

5. Aktor cizgisi her iki yonde oynak, basit cizgi degil. Bunu projeyi zayiflatmadan nasil sunarim? Yoksa sunmamali miyim, cunku projenin merkez iddiasi tam da o cizgi?

6. Bu sonuclara bakan teknik bir juri uyesinin soracagi ve bizim sormadigimiz soru ne?

ZATEN BILDIGIMIZ EKSIKLER

Genislik. Iki kirmizi cizgi, tek bir protokol sekli, iki adres. Ucuncu bir adres, farkli bir protokol, ve cekimlerle ilgili olmayan bir cizgi denenmedi. Bir protokol sahibi kilpayi bir kural yayinlayip kasten tetikleyerek durdurmayi ticarete cevirebilir, bunu kapatan bir sey yok.`);
