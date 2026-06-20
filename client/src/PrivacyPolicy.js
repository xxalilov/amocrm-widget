import React from 'react';
import './PrivacyPolicy.css';

// Standalone privacy policy page, served at /privacy on the SPA origin
// (https://deduplicate.upsoft.app/privacy). Used as the "Политика
// конфиденциальности" link in the Kommo/amoCRM marketplace listing.
export default function PrivacyPolicy() {
  return (
    <div className="pp">
      <div className="pp__container">
        <header className="pp__header">
          <h1>Политика конфиденциальности</h1>
          <p className="pp__subtitle">
            Виджет «Поиск и объединение дубликатов» для amoCRM (Kommo) — UPSOFT
          </p>
          <p className="pp__updated">Последнее обновление: июнь 2026</p>
        </header>

        <section className="pp__section">
          <h2>1. Какие данные мы используем</h2>
          <ul>
            <li>OAuth-токены amoCRM (access / refresh) — хранятся в зашифрованном виде;</li>
            <li>поддомен аккаунта amoCRM и API-ключ виджета;</li>
            <li>
              данные контактов и сделок (имя, телефон, email, пользовательские поля,
              связи) — обрабатываются <strong>временно</strong> во время поиска и
              объединения дубликатов и не сохраняются на наших серверах.
            </li>
          </ul>
        </section>

        <section className="pp__section">
          <h2>2. Цель обработки</h2>
          <p>
            Единственная цель — поиск дубликатов контактов и сделок в вашем аккаунте
            amoCRM и их объединение по заданным вами правилам.
          </p>
        </section>

        <section className="pp__section">
          <h2>3. Хранение данных</h2>
          <p>
            Токены доступа и настройки виджета хранятся в зашифрованном виде. Данные
            контактов и сделок обрабатываются в режиме реального времени через API
            amoCRM и не хранятся на наших серверах после завершения операции.
          </p>
        </section>

        <section className="pp__section">
          <h2>4. Безопасность</h2>
          <p>
            Все соединения защищены HTTPS/SSL. Доступ к API виджета возможен только по
            индивидуальному ключу аккаунта (Bearer-токен). Токены доступа amoCRM
            обновляются автоматически (ротация refresh-токена).
          </p>
        </section>

        <section className="pp__section">
          <h2>5. Передача третьим лицам</h2>
          <p>Мы не передаём и не продаём ваши данные третьим лицам.</p>
        </section>

        <section className="pp__section">
          <h2>6. Удаление данных</h2>
          <p>
            При отключении интеграции токены доступа удаляются. Данные в вашем аккаунте
            amoCRM не затрагиваются. Объединённые дубликаты помечаются тегом
            (amoCRM не позволяет удалять записи через API), а не удаляются физически.
          </p>
        </section>

        <section className="pp__section">
          <h2>7. Права пользователя</h2>
          <ul>
            <li>отключить интеграцию в любой момент;</li>
            <li>запросить удаление хранимых данных (токенов и настроек);</li>
            <li>получить информацию о том, какие данные обрабатываются.</li>
          </ul>
        </section>

        <section className="pp__section">
          <h2>8. Контакты</h2>
          <p>
            Email: <a href="mailto:upsoftdigital@gmail.com">upsoftdigital@gmail.com</a>
            <br />
            Сайт: <a href="https://upsoft.uz" target="_blank" rel="noreferrer">upsoft.uz</a>
          </p>
        </section>

        <section className="pp__section">
          <h2>9. Изменения политики</h2>
          <p>
            Политика может обновляться. Продолжая использовать виджет, вы соглашаетесь с
            действующей редакцией.
          </p>
        </section>

        <footer className="pp__footer">© {new Date().getFullYear()} UPSOFT — upsoft.uz</footer>
      </div>
    </div>
  );
}
