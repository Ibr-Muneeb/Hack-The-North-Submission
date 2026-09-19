import Brick from "./Brick.jsx";

/** model data -> one <Brick> per entry. It decides nothing about placement. */
export default function LEGOModel({ model }) {
  return (
    <>
      {model.bricks.map((brick, index) => (
        <Brick key={index} {...brick} />
      ))}
    </>
  );
}
