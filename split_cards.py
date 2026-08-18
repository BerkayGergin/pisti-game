import os
from PIL import Image

input_path = "sheet.png"
output_dir = os.path.join("public", "assets", "cards", "special_duo")

# Klasör yoksa otomatik oluştur
os.makedirs(output_dir, exist_ok=True)

if not os.path.exists(input_path):
    print(f"Hata: '{input_path}' dosyası bulunamadı! Lütfen görseli proje klasörüne koyup adını 'sheet.png' yapın.")
    exit(1)

img = Image.open(input_path)
width, height = img.size

# 5 eşit parçaya böl (As, Vale, Kız, Papaz, Kart Arkası)
card_names = ["A.png", "J.png", "Q.png", "K.png", "back.png"]
card_w = width / 5

for i, name in enumerate(card_names):
    left = int(i * card_w)
    right = int((i + 1) * card_w)
    top = 0
    bottom = height

    # Kartı kes ve kaydet
    card_img = img.crop((left, top, right, bottom))
    output_file = os.path.join(output_dir, name)
    card_img.save(output_file, quality=95)
    print(f"✓ {name} başarıyla oluşturuldu -> {output_file}")

print("\n🎉 Tüm kartlar 'public/assets/cards/special_duo' klasörüne aktarıldı!")